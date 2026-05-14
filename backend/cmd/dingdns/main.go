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

	// Load config
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Generate JWT secret if not set (used for admin sessions)
	if cfg.JWTSecret == "" {
		bytes := make([]byte, 32)
		rand.Read(bytes)
		cfg.JWTSecret = hex.EncodeToString(bytes)
		cfg.Save(*configPath)
		log.Println("Generated new JWT secret")
	}

	// Register all modules (ORDER MATTERS for menu display)
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

	// Initialize database
	log.Println("Initializing database...")
	if err := models.InitDB(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	log.Println("Database initialized")

	// Initialize modules
	for _, m := range core.GetModules() {
		if err := m.OnInit(); err != nil {
			log.Printf("Warning: module %s init failed: %v", m.ID(), err)
		}
	}

	// Ensure super admin exists.
	// Pass the configPath so we can find the installer's handoff file,
	// and the admin email from config so we don't hardcode dingdns.com.
	ensureSuperAdmin(*configPath, cfg.AdminEmail)

	// Ensure at least one API key exists
	ensureDefaultAPIKey()

	// Start DNS server
	log.Println("Starting DNS server...")
	dnsServer := dnsserver.NewServer(cfg)
	if err := dnsServer.Start(); err != nil {
		log.Fatalf("Failed to start DNS server: %v", err)
	}
	dnsserver.SetGlobalServer(dnsServer)

	// Setup API router
	handler := api.SetupRouter()

	if cfg.SSLEnabled {
		// HTTPS on 443
		go func() {
			addr := ":" + cfg.HTTPSPort
			log.Printf("HTTPS server starting on %s", addr)
			if err := http.ListenAndServeTLS(addr, cfg.SSLCert, cfg.SSLKey, handler); err != nil {
				log.Printf("HTTPS server error: %v", err)
			}
		}()

		// Port 80: redirect to HTTPS (if ssl_redirect_http != "false") or serve normally
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

		// Port 8080: plain HTTP access (can be disabled via ssl_allow_http_port=false)
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
		// Plain HTTP mode (no SSL)
		go func() {
			addr := ":" + cfg.HTTPPort
			log.Printf("API server starting on %s", addr)
			if err := http.ListenAndServe(addr, handler); err != nil {
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

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	dnsServer.Stop()
	log.Println("DingDns stopped")
}

// initialAdminPasswordFile is the path the installer drops a one-time
// password file at. We read it, use it, then delete it — so the secret
// never lives on disk after the first successful boot.
//
// Resolution order for the initial admin password:
//  1. DINGDNS_INITIAL_ADMIN_PASSWORD env var (handy for CI / re-installs)
//  2. The handoff file at <configDir>/.initial-admin-password
//     (defaults to /opt/dingdns/.initial-admin-password)
//  3. A securely generated random password, logged once on startup
//
// In every case the password is logged to stdout/journal exactly once
// when the admin is created. There is no hardcoded "admin123" anymore.
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

	// Fall back to a random password — better than a known default.
	bytes := make([]byte, 18)
	if _, err := rand.Read(bytes); err != nil {
		// crypto/rand should not fail on real systems; if it does we
		// refuse to invent a weak password.
		log.Fatalf("Failed to generate random admin password: %v", err)
	}
	// URL-safe base64, trimmed of padding, gives ~24 printable chars.
	pw := strings.TrimRight(base64.URLEncoding.EncodeToString(bytes), "=")
	return pw, "random"
}

// consumeInitialAdminPasswordFile removes the handoff file after the
// admin has been created, so the secret doesn't linger on disk.
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
		// Still clean up the handoff file if it somehow lingered.
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

	// Wipe the handoff file now that the password is committed to the DB.
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