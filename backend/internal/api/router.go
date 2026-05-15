package api

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/dingdns/dingdns/internal/adminui"
	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/ddns"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// SetupRouter configures all API routes
func SetupRouter() http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.Logger())

	// Dynamic CORS
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if origin == "" {
				return true
			}
			var keys []models.APIKey
			models.DB.Where("is_active = ?", true).Find(&keys)
			for _, key := range keys {
				if key.AllowedOrigins == "" || key.AllowedOrigins == "*" {
					return true
				}
				for _, o := range strings.Split(key.AllowedOrigins, ",") {
					if strings.TrimSpace(o) == origin || strings.TrimSpace(o) == "*" {
						return true
					}
				}
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Rate limiter
	rateLimiter := core.NewRateLimiter(120, time.Minute)

	// Auth handler
	authHandler := core.NewAuthHandler()

	// ============ Public endpoints (no auth) ============
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "dingdns", "version": "2.0"})
	})

	// DDNS update endpoints (token-based auth)
	r.GET("/api/ddns/update", handleDDNSUpdate)
	r.POST("/api/ddns/update", handleDDNSUpdate)
	r.GET("/nic/update", handleDDNSUpdate)
	r.GET("/api/ip", handleWhoAmI)

	// ============ API Key protected routes (for external frontends) ============
	api := r.Group("/api")
	api.Use(core.RateLimitMiddleware(rateLimiter))
	api.Use(core.IPBanMiddleware(nil))
	api.Use(APIKeyMiddleware())
	{
		// Public settings (for frontends)
		api.GET("/settings/public", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"captcha_enabled":            core.GetSetting("captcha_enabled") == "true",
				"registration_enabled":       core.GetSetting("registration_enabled") == "true",
				"email_verification_enabled": core.GetSetting("email_verification_enabled") == "true",
			})
		})

		// Register modules' public routes
		for _, m := range core.GetModules() {
			m.RegisterPublicRoutes(api)
		}
	}

	// ============ Admin Panel ============
	admin := r.Group("/admin")
	admin.Use(core.SecurityHeaders())
	admin.Use(core.RateLimitMiddleware(core.NewRateLimiter(60, time.Minute)))
	admin.Use(core.IPBanMiddleware(nil))
	{
		// Admin auth (no session needed)
		admin.POST("/api/login", authHandler.Login)
		admin.GET("/api/captcha", authHandler.GetCaptcha)

		// Admin authenticated routes
		authenticated := admin.Group("/api")
		authenticated.Use(core.AdminAuthMiddleware())
		{
			// Profile & auth
			authenticated.POST("/logout", authHandler.Logout)
			authenticated.GET("/me", authHandler.GetProfile)
			authenticated.PUT("/me", authHandler.UpdateProfile)
			authenticated.PUT("/password", authHandler.ChangePassword)
			authenticated.GET("/menu", authHandler.GetMenu)

			// 2FA
			authenticated.POST("/2fa/setup", authHandler.Setup2FA)
			authenticated.POST("/2fa/verify", authHandler.Verify2FA)
			authenticated.POST("/2fa/disable", authHandler.Disable2FA)

			// Sessions
			authenticated.GET("/sessions", authHandler.ListSessions)
			authenticated.DELETE("/sessions/:id", authHandler.RevokeSession)

			// IP Allowlist (admin's own)
			authenticated.GET("/ip-allowlist", authHandler.ListIPAllowlist)
			authenticated.POST("/ip-allowlist", authHandler.AddIPAllowlist)
			authenticated.DELETE("/ip-allowlist/:id", authHandler.DeleteIPAllowlist)
			authenticated.PUT("/ip-restriction", authHandler.ToggleIPRestriction)

			// Register all module routes
			for _, m := range core.GetModules() {
				m.RegisterRoutes(authenticated)
			}
		}
	}

	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	// Wrap with admin UI handler
	return adminUIHandler(r)
}

// APIKeyMiddleware validates X-API-Key header
func APIKeyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			core.RecordSuspiciousEvent(c, "bad_api_key", "missing X-API-Key header")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "API key required"})
			c.Abort()
			return
		}

		var key models.APIKey
		if err := models.DB.Where("key = ? AND is_active = ?", apiKey, true).First(&key).Error; err != nil {
			// Don't echo the supplied key into the log — it could be huge / contain garbage.
			preview := apiKey
			if len(preview) > 24 {
				preview = preview[:24] + "..."
			}
			core.RecordSuspiciousEvent(c, "bad_api_key", "invalid key: "+preview)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid API key"})
			c.Abort()
			return
		}

		// Check allowed origins
		origin := c.GetHeader("Origin")
		if key.AllowedOrigins != "" && origin != "" {
			allowed := false
			for _, o := range strings.Split(key.AllowedOrigins, ",") {
				o = strings.TrimSpace(o)
				if o == "*" || o == origin {
					allowed = true
					break
				}
			}
			if !allowed {
				core.RecordSuspiciousEvent(c, "bad_origin", "origin="+origin+" key="+key.Name)
				c.JSON(http.StatusForbidden, gin.H{"error": "origin not allowed"})
				c.Abort()
				return
			}
		}

		// Check allowed IPs (if configured)
		if key.AllowedIPs != "" {
			clientIP := core.GetRealIP(c)
			if !ipInList(clientIP, key.AllowedIPs) {
				core.RecordSuspiciousEvent(c, "bad_ip", "ip not in allowlist for key="+key.Name)
				c.JSON(http.StatusForbidden, gin.H{"error": "IP not allowed"})
				c.Abort()
				return
			}
		}

		// Update last used async
		go func() {
			now := time.Now()
			models.DB.Model(&models.APIKey{}).Where("id = ?", key.ID).Update("last_used", &now)
		}()

		c.Set("api_key_id", key.ID)
		c.Set("api_key_name", key.Name)

		// Log usage if enabled
		if core.GetSetting("api_usage_log_enabled") != "false" {
			start := time.Now()
			c.Next()
			duration := time.Since(start).Milliseconds()
			status := c.Writer.Status()
			method := c.Request.Method
			path := c.Request.URL.Path
			ip := c.ClientIP()
			ua := c.GetHeader("User-Agent")
			keyID := key.ID
			keyName := key.Name
			go func() {
				models.DB.Create(&models.APIUsageLog{
					APIKeyID:   keyID,
					APIKeyName: keyName,
					Method:     method,
					Path:       path,
					StatusCode: status,
					DurationMs: duration,
					IP:         ip,
					UserAgent:  ua,
				})
				// Retention: clean up old entries every ~100 requests (probabilistic)
				if keyID%100 == 0 {
					if days := core.GetSetting("api_usage_log_retention_days"); days != "" {
						var d int
						if _, err := fmt.Sscanf(days, "%d", &d); err == nil && d > 0 {
							cutoff := time.Now().AddDate(0, 0, -d)
							models.DB.Where("created_at < ?", cutoff).Delete(&models.APIUsageLog{})
						}
					}
				}
			}()
		} else {
			c.Next()
		}
	}
}

// ipInList checks if clientIP is in a comma-separated list of IPs/CIDRs
func ipInList(clientIP, list string) bool {
	parsed := net.ParseIP(clientIP)
	if parsed == nil {
		return false
	}
	for _, entry := range strings.Split(list, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		// CIDR range (e.g. 192.168.1.0/24)
		if strings.Contains(entry, "/") {
			_, ipNet, err := net.ParseCIDR(entry)
			if err == nil && ipNet.Contains(parsed) {
				return true
			}
			continue
		}
		// Exact IP
		if entry == clientIP {
			return true
		}
	}
	return false
}

// DDNS handlers
func handleDDNSUpdate(c *gin.Context) {
	token := c.Query("token")
	ip := c.Query("ip")
	if ip == "" {
		ip = c.Query("myip")
	}
	if ip == "" {
		ip = core.GetRealIP(c)
	}

	if token != "" {
		result, err := ddns.UpdateByToken(token, ip)
		if err != nil {
			core.RecordSuspiciousEvent(c, "bad_token", "ddns token rejected: "+err.Error())
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
		return
	}

	// Try Basic Auth (DynDNS compatible)
	_, password, hasAuth := c.Request.BasicAuth()
	if hasAuth {
		hostname := c.Query("hostname")
		if hostname == "" {
			c.String(http.StatusBadRequest, "notfqdn")
			return
		}
		// Use password as token
		result, err := ddns.UpdateByToken(password, ip)
		if err != nil {
			core.RecordSuspiciousEvent(c, "bad_token", "ddns basic-auth rejected: "+err.Error())
			c.String(http.StatusUnauthorized, "badauth")
			return
		}
		if result.Changed {
			c.String(http.StatusOK, "good "+ip)
		} else {
			c.String(http.StatusOK, "nochg "+ip)
		}
		return
	}

	c.JSON(http.StatusBadRequest, gin.H{"error": "token or credentials required"})
}

func handleWhoAmI(c *gin.Context) {
	ip := core.GetRealIP(c)
	format := c.Query("format")
	if format == "json" {
		c.JSON(http.StatusOK, gin.H{"ip": ip})
	} else {
		c.String(http.StatusOK, ip)
	}
}

// adminUIHandler wraps gin engine to serve admin SPA for non-API admin routes
func adminUIHandler(ginEngine *gin.Engine) http.Handler {
	staticHandler := adminui.StaticHandler()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Admin UI routes (not API)
		isAdminUI := (path == "/admin" || strings.HasPrefix(path, "/admin/")) && !strings.HasPrefix(path, "/admin/api/")
		if isAdminUI {
			// Try static file first (assets, favicon, etc.)
			subPath := strings.TrimPrefix(path, "/admin/")
			if subPath != "" && adminui.HasFile(subPath) {
				staticHandler.ServeHTTP(w, r)
				return
			}

			// SPA fallback — serve index.html
			indexData, err := adminui.IndexHTML()
			if err != nil {
				http.Error(w, "Admin UI not available", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write(indexData)
			return
		}

		// All other routes go to Gin
		ginEngine.ServeHTTP(w, r)
	})
}
