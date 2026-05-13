package core

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DB reference - set during initialization
var DB *gorm.DB

// SetDB sets the database reference for core package
func SetDB(db *gorm.DB) {
	DB = db
}

// --- Admin Auth Middleware ---

// AdminAuthMiddleware validates admin session token from cookie or Authorization header
func AdminAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractAdminToken(c)
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}

		// Find active session
		var session AdminSession
		if err := DB.Where("token = ? AND is_active = ? AND expires_at > ?",
			token, true, time.Now()).First(&session).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired session"})
			c.Abort()
			return
		}

		// Find admin
		var admin Admin
		if err := DB.First(&admin, session.AdminID).Error; err != nil || !admin.IsActive {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "account disabled"})
			c.Abort()
			return
		}

		// Update last used (async)
		go func() {
			DB.Model(&session).Update("last_used", time.Now())
		}()

		// Store admin info in context
		c.Set("admin_id", admin.ID)
		c.Set("admin_username", admin.Username)
		c.Set("admin_role", admin.Role)
		c.Set("admin_permissions", admin.Permissions)
		c.Set("admin", &admin)
		c.Set("session_id", session.ID)
		c.Next()
	}
}

// RequirePermission middleware checks if admin has a specific permission
func RequirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		admin, exists := c.Get("admin")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}

		a := admin.(*Admin)
		if !a.HasPermission(permission) {
			c.JSON(http.StatusForbidden, gin.H{
				"error":      "insufficient permissions",
				"required":   permission,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireSuperAdmin middleware ensures only super_admin can access
func RequireSuperAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("admin_role")
		if role != "super_admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "super admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func extractAdminToken(c *gin.Context) string {
	// Try cookie first
	if token, err := c.Cookie("admin_session"); err == nil && token != "" {
		return token
	}

	// Try Authorization header
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			return parts[1]
		}
	}

	return ""
}

// --- Session Management ---

// GenerateSessionToken creates a cryptographically secure session token
func GenerateSessionToken() (string, error) {
	bytes := make([]byte, 64)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// CreateAdminSession creates a new session for an admin
func CreateAdminSession(adminID uint, ip, userAgent string, duration time.Duration) (*AdminSession, error) {
	token, err := GenerateSessionToken()
	if err != nil {
		return nil, err
	}

	session := &AdminSession{
		AdminID:   adminID,
		Token:     token,
		IP:        ip,
		UserAgent: userAgent,
		IsActive:  true,
		ExpiresAt: time.Now().Add(duration),
		LastUsed:  time.Now(),
	}

	if err := DB.Create(session).Error; err != nil {
		return nil, err
	}
	return session, nil
}

// --- Security Helpers ---

// GetRealIP extracts the real client IP
func GetRealIP(c *gin.Context) string {
	for _, header := range []string{"X-Real-IP", "X-Forwarded-For"} {
		ip := c.GetHeader(header)
		if ip != "" {
			parts := strings.Split(ip, ",")
			return strings.TrimSpace(parts[0])
		}
	}
	return c.ClientIP()
}

// CheckIPInList checks if an IP matches any in a list (supports CIDR)
func CheckIPInList(clientIP string, allowedIPs []string) bool {
	for _, allowed := range allowedIPs {
		if allowed == clientIP {
			return true
		}
		if strings.Contains(allowed, "/") {
			_, cidr, err := net.ParseCIDR(allowed)
			if err == nil && cidr.Contains(net.ParseIP(clientIP)) {
				return true
			}
		}
	}
	return false
}

// GetAdminID extracts admin ID from context
func GetAdminID(c *gin.Context) uint {
	val, _ := c.Get("admin_id")
	if id, ok := val.(uint); ok {
		return id
	}
	return 0
}

// --- Rate Limiter ---

// RateLimiter tracks request counts per IP
type RateLimiter struct {
	mu       sync.Mutex
	requests map[string]*rateBucket
	limit    int
	window   time.Duration
}

type rateBucket struct {
	count   int
	resetAt time.Time
}

// NewRateLimiter creates a rate limiter
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		requests: make(map[string]*rateBucket),
		limit:    limit,
		window:   window,
	}
	go func() {
		for {
			time.Sleep(window)
			rl.mu.Lock()
			now := time.Now()
			for k, v := range rl.requests {
				if now.After(v.resetAt) {
					delete(rl.requests, k)
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

// RateLimitMiddleware limits requests per IP
func RateLimitMiddleware(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := GetRealIP(c)

		rl.mu.Lock()
		bucket, exists := rl.requests[ip]
		if !exists || time.Now().After(bucket.resetAt) {
			rl.requests[ip] = &rateBucket{count: 1, resetAt: time.Now().Add(rl.window)}
			rl.mu.Unlock()
			c.Next()
			return
		}

		bucket.count++
		count := bucket.count
		rl.mu.Unlock()

		if count > rl.limit {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// --- Security Headers Middleware ---

// SecurityHeaders adds security headers to all admin responses
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Next()
	}
}

// --- CSRF Protection ---

// CSRFMiddleware validates CSRF token for state-changing requests
func CSRFMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip for GET, HEAD, OPTIONS
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		// Check CSRF token header
		csrfToken := c.GetHeader("X-CSRF-Token")
		sessionToken := extractAdminToken(c)

		if csrfToken == "" || sessionToken == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "CSRF token required"})
			c.Abort()
			return
		}

		// CSRF token should match session token (double-submit cookie pattern)
		// Frontend sends the session token as X-CSRF-Token header
		if csrfToken != sessionToken {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid CSRF token"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// --- IP Ban Middleware ---

// IPBanMiddleware checks if client IP is banned
func IPBanMiddleware(banModel interface{}) gin.HandlerFunc {
	var cache struct {
		mu       sync.RWMutex
		ips      map[string]bool
		loadedAt time.Time
	}
	cache.ips = make(map[string]bool)

	return func(c *gin.Context) {
		// Reload cache every 60 seconds
		cache.mu.RLock()
		stale := time.Since(cache.loadedAt) > 60*time.Second
		cache.mu.RUnlock()

		if stale {
			cache.mu.Lock()
			if time.Since(cache.loadedAt) > 60*time.Second {
				type ipBan struct {
					IP        string
					ExpiresAt *time.Time
				}
				var bans []ipBan
				DB.Table("ip_bans").Select("ip, expires_at").Find(&bans)

				newCache := make(map[string]bool)
				now := time.Now()
				for _, ban := range bans {
					if ban.ExpiresAt == nil || ban.ExpiresAt.After(now) {
						newCache[ban.IP] = true
					}
				}
				cache.ips = newCache
				cache.loadedAt = time.Now()
			}
			cache.mu.Unlock()
		}

		ip := GetRealIP(c)

		cache.mu.RLock()
		banned := cache.ips[ip]
		if !banned {
			// Check CIDR bans
			for bannedIP := range cache.ips {
				if strings.Contains(bannedIP, "/") {
					_, cidr, err := net.ParseCIDR(bannedIP)
					if err == nil && cidr.Contains(net.ParseIP(ip)) {
						banned = true
						break
					}
				}
			}
		}
		cache.mu.RUnlock()

		if banned {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// --- Brute Force Protection ---

// CheckBruteForce checks if too many failed login attempts from this IP
func CheckBruteForce(ip string) bool {
	var count int64
	// Use configurable lockout duration (default 15 min)
	durationMin := 15
	if v := GetSetting("admin_lockout_duration"); v != "" {
		if n, err := parseIntSafe(v); err == nil && n > 0 {
			durationMin = n
		}
	}
	threshold := time.Now().Add(-time.Duration(durationMin) * time.Minute)
	// Use configurable attempt threshold (default 10 per IP)
	DB.Table("login_attempts").
		Where("ip = ? AND success = ? AND created_at > ?", ip, false, threshold).
		Count(&count)
	return count >= 10
}

// RecordLoginAttempt logs a login attempt
func RecordLoginAttempt(ip, username, userAgent string, success bool) {
	DB.Exec("INSERT INTO login_attempts (ip, username, success, user_agent, created_at) VALUES (?, ?, ?, ?, ?)",
		ip, username, success, userAgent, time.Now())
}

// IncrementFailedAttempts increments and possibly locks admin account
func IncrementFailedAttempts(adminID uint) {
	var admin Admin
	if err := DB.First(&admin, adminID).Error; err != nil {
		return
	}

	admin.FailedAttempts++
	DB.Model(&admin).Update("failed_attempts", admin.FailedAttempts)

	// Use configurable threshold (default 5)
	threshold := 5
	if v := GetSetting("admin_lockout_attempts"); v != "" {
		if n, err := parseIntSafe(v); err == nil && n > 0 {
			threshold = n
		}
	}
	// Use configurable lockout duration (default 15 min)
	durationMin := 15
	if v := GetSetting("admin_lockout_duration"); v != "" {
		if n, err := parseIntSafe(v); err == nil && n > 0 {
			durationMin = n
		}
	}

	if admin.FailedAttempts >= threshold {
		lockUntil := time.Now().Add(time.Duration(durationMin) * time.Minute)
		DB.Model(&admin).Updates(map[string]interface{}{
			"failed_attempts": 0,
			"locked_until":    &lockUntil,
		})
	}
}

func parseIntSafe(s string) (int, error) {
	var n int
	_, err := fmt.Sscanf(s, "%d", &n)
	return n, err
}

// ResetFailedAttempts resets the counter on successful login
func ResetFailedAttempts(adminID uint) {
	DB.Model(&Admin{}).Where("id = ?", adminID).Updates(map[string]interface{}{
		"failed_attempts": 0,
		"locked_until":    nil,
	})
}
