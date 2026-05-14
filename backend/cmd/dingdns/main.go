package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/dingdns/dingdns/internal/api"
	"github.com/dingdns/dingdns/internal/config"
	"github.com/dingdns/dingdns/internal/core"
	dnsserver "github.com/dingdns/dingdns/internal/dns"
	"github.com/dingdns/dingdns/internal/models"

	// Register modules
	modAdmins "github.com/dingdns/dingdns/internal/modules/admins"
	modAlerts "github.com/dingdns/dingdns/internal/modules/alerts"
	modAPIKeys "github.com/dingdns/dingdns/internal/modules/apikeys"
	modAPIUsage "github.com/dingdns/dingdns/internal/modules/apiusage"
	modAudit "github.com/dingdns/dingdns/internal/modules/audit"
	modDashboard "github.com/dingdns/dingdns/internal/modules/dashboard"
	modDNS "github.com/dingdns/dingdns/internal/modules/dns"
	modEmail "github.com/dingdns/dingdns/internal/modules/email"
	modSecurity "github.com/dingdns/dingdns/internal/modules/security"
	modServer "github.com/dingdns/dingdns/internal/modules/server"
	modSettings "github.com/dingdns/dingdns/internal/modules/settings"
)

var version = "2.0.0"

func main() {
	configPath := flag.String("config", "/opt/dingdns/config.json", "Path to config file")
	showVersion := flag.Bool("version", false, "Show version")
	flag.Parse()

	if *showVersion {
		fmt.Printf("DingDns v%s\n", version)
		os.Exit(0)
	}

	log.Printf("DingDns v%s starting...", version)

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if cfg.JWTSecret == "" {
		bytes := make([]byte, 32)
		rand.Read(bytes)
		cfg.JWTSecret = hex.EncodeToString(bytes)
		cfg.Save(*configPath)
		log.Println("Generated new JWT secret")
	}

	core.RegisterModule(modDashboard.New())
	core.RegisterModule(modDNS.New())
	core.RegisterModule(modAPIKeys.New())
	core.RegisterModule(modAPIUsage.New())
	core.RegisterModule(modSecurity.New())
	core.RegisterModule(modServer.New())
	core.RegisterModule(modEmail.New())
	core.RegisterModule(modAlerts.New())
	core.RegisterModule(modAdmins.New())
	core.RegisterModule(modAudit.New())
	core.RegisterModule(modSettings.New())

	log.Println("Initializing database...")
	if err := models.InitDB(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Println("Database initialized")

	for _, m := range core.GetModules() {
		if err := m.OnInit(); err != nil {
			log.Printf("Warning: module %s init failed: %v", m.ID(), err)
		}
	}

	ensureSuperAdmin(*configPath, cfg.AdminEmail)
	ensureDefaultAPIKey()
	seedSettingsFromConfig(cfg)

	log.Println("Starting DNS server...")
	dnsServer := dnsserver.NewServer(cfg)
	if err := dnsServer.Start(); err != nil {
		log.Fatalf("Failed to start DNS server: %v", err)
	}
	dnsserver.SetGlobalServer(dnsServer)

	handler := api.SetupRouter()

	if cfg.SSLEnabled {
		go func() {
			addr := ":" + cfg.HTTPSPort
			log.Printf("HTTPS server starting on %s", addr)
			if err := http.ListenAndServeTLS(addr, cfg.SSLCert, cfg.SSLKey, handler); err != nil {
				log.Printf("HTTPS server error: %v", err)
			}
		}()

		go func() {
			h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if core.GetSetting("ssl_redirect_http") != "false" {
					http.Redirect(w, r, "https://"+r.Host+r.RequestURI, http.StatusMovedPermanently)
					return
				}
				handler.ServeHTTP(w, r)
			})
			log.Printf("HTTP handler starting on :80")
			if err := http.ListenAndServe(":80", h); err != nil {
				log.Printf("HTTP handler error: %v", err)
			}
		}()

		go func() {
			h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if core.GetSetting("ssl_allow_http_port") == "false" {
					http.Error(w, "HTTP access on this port is disabled. Use HTTPS.", http.StatusForbidden)
					return
				}
				handler.ServeHTTP(w, r)
			})
			addr := ":" + cfg.HTTPPort
			log.Printf("HTTP fallback on %s", addr)
			if err := http.ListenAndServe(addr, h); err != nil {
				log.Printf("HTTP fallback error: %v", err)
			}
		}()
	} else {
		go func() {
			h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if core.GetSetting("ssl_allow_http_port") == "false" {
					http.Error(w, "HTTP access on this port is disabled by admin.", http.StatusForbidden)
					return
				}
				handler.ServeHTTP(w, r)
			})
			addr := ":" + cfg.HTTPPort
			log.Printf("API server starting on %s", addr)
			if err := http.ListenAndServe(addr, h); err != nil {
				log.Fatalf("Failed to start HTTP server: %v", err)
			}
		}()
	}

	log.Println("=========================================")
	log.Println("  DingDns v2.0 - Modular DNS Server")
	log.Printf("  DNS Server:  :%s", cfg.DNSPort)
	log.Printf("  API Server:  :%s", cfg.HTTPPort)
	log.Printf("  Admin Panel: :%s/admin/", cfg.HTTPPort)
	log.Printf("  Domain:      %s", cfg.Domain)
	log.Println("=========================================")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	dnsServer.Stop()
	log.Println("DingDns stopped")
}

func initialAdminPasswordPath(configPath string) string {
	dir := filepath.Dir(configPath)
	if dir == "" || dir == "." {
		dir = "/opt/dingdns"
	}
	return filepath.Join(dir, ".initial-admin-password")
}

func loadInitialAdminPassword(configPath string) (password string, source string) {
	if envPw := strings.TrimSpace(os.Getenv("DINGDNS_INITIAL_ADMIN_PASSWORD")); envPw != "" {
		return envPw, "env"
	}

	pwFile := initialAdminPasswordPath(configPath)
	if data, err := os.ReadFile(pwFile); err == nil {
		pw := strings.TrimSpace(string(data))
		if pw != "" {
			return pw, "file:" + pwFile
		}
	}

	bytes := make([]byte, 18)
	if _, err := rand.Read(bytes); err != nil {
		log.Fatalf("Failed to generate random admin password: %v", err)
	}
	pw := strings.TrimRight(base64.URLEncoding.EncodeToString(bytes), "=")
	return pw, "random"
}

func consumeInitialAdminPasswordFile(configPath string) {
	pwFile := initialAdminPasswordPath(configPath)
	if _, err := os.Stat(pwFile); err == nil {
		if err := os.Remove(pwFile); err != nil {
			log.Printf("Warning: could not remove %s: %v", pwFile, err)
		}
	}
}

func ensureSuperAdmin(configPath string, adminEmail string) {
	var count int64
	core.DB.Model(&core.Admin{}).Where("role = ?", "super_admin").Count(&count)
	if count > 0 {
		consumeInitialAdminPasswordFile(configPath)
		return
	}

	password, source := loadInitialAdminPassword(configPath)

	if adminEmail == "" {
		adminEmail = "admin@localhost"
	}

	admin := core.Admin{
		Username:    "admin",
		Email:       adminEmail,
		Role:        "super_admin",
		Permissions: "*",
		IsActive:    true,
	}
	admin.SetPassword(password)

	if err := core.DB.Create(&admin).Error; err != nil {
		log.Printf("Failed to create super admin: %v", err)
		return
	}

	consumeInitialAdminPasswordFile(configPath)

	log.Println("========================================")
	log.Println("  Super Admin created:")
	log.Println("  Username: admin")
	if source == "random" {
		log.Printf("  Password: %s", password)
		log.Println("  (auto-generated — save it now, it won't be shown again)")
	} else {
		log.Printf("  Password source: %s", source)
		log.Println("  (set during installation — change it in the panel if needed)")
	}
	log.Println("========================================")
}

// seedSettingsFromConfig fills empty DB-backed settings rows from config.json.
// Only writes if the key is currently empty so user-saved values always win.
func seedSettingsFromConfig(cfg *config.Config) {
	seedIfEmpty := func(key, val string) {
		if val == "" {
			return
		}
		if existing := core.GetSetting(key); existing != "" {
			return
		}
		core.SetSetting(key, val)
	}

	seedIfEmpty("server_domain", cfg.Domain)
	seedIfEmpty("ns1_hostname", cfg.NSPrimary)
	seedIfEmpty("ns2_hostname", cfg.NSSecondary)
}

func ensureDefaultAPIKey() {
	var count int64
	models.DB.Model(&models.APIKey{}).Count(&count)
	if count > 0 {
		return
	}

	key, err := models.GenerateAPIKey()
	if err != nil {
		log.Printf("Failed to generate default API key: %v", err)
		return
	}

	apiKey := models.APIKey{
		Name:           "Default Key",
		Key:            key,
		AllowedOrigins: "*",
		IsActive:       true,
	}

	if err := models.DB.Create(&apiKey).Error; err != nil {
		log.Printf("Failed to create default API key: %v", err)
		return
	}

	log.Println("========================================")
	log.Println("  Default API key created:")
	log.Printf("  Key: %s", key)
	log.Println("  Restrict origins in admin panel!")
	log.Println("========================================")
}
