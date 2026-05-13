package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
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

	// Ensure super admin exists
	ensureSuperAdmin()

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

func ensureSuperAdmin() {
	var count int64
	core.DB.Model(&core.Admin{}).Where("role = ?", "super_admin").Count(&count)
	if count > 0 {
		return
	}

	admin := core.Admin{
		Username:    "admin",
		Email:       "admin@dingdns.com",
		Role:        "super_admin",
		Permissions: "*",
		IsActive:    true,
	}
	admin.SetPassword("admin123")

	if err := core.DB.Create(&admin).Error; err != nil {
		log.Printf("Failed to create super admin: %v", err)
		return
	}

	log.Println("========================================")
	log.Println("  Super Admin created:")
	log.Println("  Username: admin")
	log.Println("  Password: admin123")
	log.Println("  CHANGE THIS PASSWORD IMMEDIATELY!")
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
