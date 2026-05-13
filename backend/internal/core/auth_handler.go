package core

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// AuthHandler handles admin authentication
type AuthHandler struct {
	captcha *CaptchaStore
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler() *AuthHandler {
	return &AuthHandler{
		captcha: NewCaptchaStore(),
	}
}

// Login handles admin login
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username   string `json:"username" binding:"required"`
		Password   string `json:"password" binding:"required"`
		TOTPCode   string `json:"totp_code"`
		CaptchaID  string `json:"captcha_id"`
		CaptchaAns string `json:"captcha_answer"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	ip := GetRealIP(c)
	userAgent := c.GetHeader("User-Agent")

	// 1. Check captcha if enabled
	if IsCaptchaEnabled() {
		if req.CaptchaID == "" || req.CaptchaAns == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "captcha is required"})
			return
		}
		ans, err := strconv.Atoi(req.CaptchaAns)
		if err != nil || !h.captcha.Validate(req.CaptchaID, ans) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "incorrect captcha answer"})
			return
		}
	}

	// 2. Check brute force
	if CheckBruteForce(ip) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many failed attempts, try again later"})
		return
	}

	// 3. Find admin
	var admin Admin
	username := strings.TrimSpace(strings.ToLower(req.Username))
	if err := DB.Where("(username = ? OR email = ?) AND is_active = ?",
		username, username, true).First(&admin).Error; err != nil {
		RecordLoginAttempt(ip, username, userAgent, false)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// 4. Check lock
	if admin.IsLocked() {
		RecordLoginAttempt(ip, username, userAgent, false)
		c.JSON(http.StatusForbidden, gin.H{"error": "account is temporarily locked"})
		return
	}

	// 5. Check IP allowlist
	if admin.IPRestricted {
		var allowedIPs []AdminIPAllowlist
		DB.Where("admin_id = ? OR admin_id = 0", admin.ID).Find(&allowedIPs)
		if len(allowedIPs) > 0 {
			ips := make([]string, len(allowedIPs))
			for i, a := range allowedIPs {
				ips[i] = a.IP
			}
			if !CheckIPInList(ip, ips) {
				RecordLoginAttempt(ip, username, userAgent, false)
				c.JSON(http.StatusForbidden, gin.H{"error": "login not allowed from this IP"})
				return
			}
		}
	}

	// 6. Check password
	if !admin.CheckPassword(req.Password) {
		RecordLoginAttempt(ip, username, userAgent, false)
		IncrementFailedAttempts(admin.ID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// 6b. Check if 2FA is required for all admins
	if GetSetting("admin_2fa_required") == "true" && !admin.TwoFactorEnabled {
		c.JSON(http.StatusForbidden, gin.H{
			"error":               "Two-factor authentication is required for admin access. Please enable 2FA on your account first, or ask a super admin to disable the 2FA requirement.",
			"requires_2fa_setup": true,
		})
		return
	}

	// 7. Check 2FA
	if admin.TwoFactorEnabled {
		if req.TOTPCode == "" {
			c.JSON(http.StatusPreconditionRequired, gin.H{
				"error":        "2FA code required",
				"requires_2fa": true,
			})
			return
		}

		var totp TOTPSecret
		if err := DB.Where("admin_id = ? AND is_enabled = ?", admin.ID, true).First(&totp).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "2FA configuration error"})
			return
		}

		if !ValidateTOTPCode(totp.Secret, req.TOTPCode) {
			// Check backup codes
			validBackup := false
			if totp.BackupCodes != "" {
				codes := strings.Split(totp.BackupCodes, ",")
				for i, code := range codes {
					if strings.TrimSpace(code) == req.TOTPCode {
						codes = append(codes[:i], codes[i+1:]...)
						DB.Model(&totp).Update("backup_codes", strings.Join(codes, ","))
						validBackup = true
						break
					}
				}
			}
			if !validBackup {
				RecordLoginAttempt(ip, username, userAgent, false)
				IncrementFailedAttempts(admin.ID)
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid 2FA code"})
				return
			}
		}
	}

	// 8. Create session
	session, err := CreateAdminSession(admin.ID, ip, userAgent, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	// 9. Record success
	RecordLoginAttempt(ip, username, userAgent, true)
	ResetFailedAttempts(admin.ID)

	now := time.Now()
	DB.Model(&admin).Update("last_login", &now)

	// Set secure cookie
	secure := c.Request.TLS != nil
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("admin_session", session.Token, 86400, "/", "", secure, true)

	c.JSON(http.StatusOK, gin.H{
		"token":      session.Token,
		"expires_in": 86400,
		"admin": gin.H{
			"id":       admin.ID,
			"username": admin.Username,
			"email":    admin.Email,
			"role":     admin.Role,
		},
	})
}

// Logout revokes the current session
func (h *AuthHandler) Logout(c *gin.Context) {
	sessionID, exists := c.Get("session_id")
	if exists {
		DB.Model(&AdminSession{}).Where("id = ?", sessionID).Update("is_active", false)
	}

	c.SetCookie("admin_session", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// GetProfile returns current admin's profile
func (h *AuthHandler) GetProfile(c *gin.Context) {
	admin, _ := c.Get("admin")
	a := admin.(*Admin)

	permissions := ParsePermissions(a.Permissions)

	c.JSON(http.StatusOK, gin.H{
		"id":                 a.ID,
		"username":           a.Username,
		"email":              a.Email,
		"role":               a.Role,
		"permissions":        permissions,
		"two_factor_enabled": a.TwoFactorEnabled,
		"ip_restricted":      a.IPRestricted,
		"last_login":         a.LastLogin,
		"created_at":         a.CreatedAt,
	})
}

// ChangePassword changes admin's own password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "old_password and new_password (min 8) required"})
		return
	}

	admin, _ := c.Get("admin")
	a := admin.(*Admin)

	if !a.CheckPassword(req.OldPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "current password is incorrect"})
		return
	}

	if err := a.SetPassword(req.NewPassword); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to set password"})
		return
	}

	DB.Model(a).Update("password", a.Password)
	c.JSON(http.StatusOK, gin.H{"message": "password changed"})
}

// UpdateProfile updates admin's own email
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "valid email required"})
		return
	}

	adminID := GetAdminID(c)
	DB.Model(&Admin{}).Where("id = ?", adminID).Update("email", req.Email)
	c.JSON(http.StatusOK, gin.H{"message": "profile updated"})
}

// GetCaptcha generates a captcha challenge (returns SVG image as data URL)
func (h *AuthHandler) GetCaptcha(c *gin.Context) {
	if !IsCaptchaEnabled() {
		c.JSON(http.StatusOK, gin.H{"enabled": false})
		return
	}
	id, imageDataURL, _ := h.captcha.Generate()
	c.JSON(http.StatusOK, gin.H{
		"enabled":       true,
		"captcha_id":    id,
		"captcha_image": imageDataURL,
	})
}

// GetMenu returns the menu based on admin's permissions
func (h *AuthHandler) GetMenu(c *gin.Context) {
	admin, _ := c.Get("admin")
	a := admin.(*Admin)
	perms := ParsePermissions(a.Permissions)
	menus := GetAllMenuItems(perms)
	c.JSON(http.StatusOK, gin.H{"menu": menus})
}

// --- 2FA ---

// Setup2FA starts 2FA setup
func (h *AuthHandler) Setup2FA(c *gin.Context) {
	admin, _ := c.Get("admin")
	a := admin.(*Admin)

	if a.TwoFactorEnabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "2FA is already enabled"})
		return
	}

	secret, err := GenerateTOTPSecret()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate secret"})
		return
	}

	var totp TOTPSecret
	result := DB.Where("admin_id = ?", a.ID).First(&totp)
	if result.Error != nil {
		totp = TOTPSecret{AdminID: a.ID, Secret: secret, IsEnabled: false}
		DB.Create(&totp)
	} else {
		DB.Model(&totp).Updates(map[string]interface{}{"secret": secret, "is_enabled": false})
	}

	uri := GetTOTPURI(secret, a.Email, "DingDns-Admin")

	c.JSON(http.StatusOK, gin.H{"secret": secret, "uri": uri})
}

// Verify2FA confirms 2FA setup
func (h *AuthHandler) Verify2FA(c *gin.Context) {
	admin, _ := c.Get("admin")
	a := admin.(*Admin)

	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code is required"})
		return
	}

	var totp TOTPSecret
	if err := DB.Where("admin_id = ?", a.ID).First(&totp).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "2FA not set up"})
		return
	}

	if !ValidateTOTPCode(totp.Secret, req.Code) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid code"})
		return
	}

	backupCodes, _ := GenerateBackupCodes()

	DB.Model(&totp).Updates(map[string]interface{}{
		"is_enabled":   true,
		"backup_codes": strings.Join(backupCodes, ","),
	})
	DB.Model(&Admin{}).Where("id = ?", a.ID).Update("two_factor_enabled", true)

	c.JSON(http.StatusOK, gin.H{"message": "2FA enabled", "backup_codes": backupCodes})
}

// Disable2FA disables 2FA
func (h *AuthHandler) Disable2FA(c *gin.Context) {
	admin, _ := c.Get("admin")
	a := admin.(*Admin)

	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password required"})
		return
	}

	if !a.CheckPassword(req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		return
	}

	DB.Where("admin_id = ?", a.ID).Delete(&TOTPSecret{})
	DB.Model(&Admin{}).Where("id = ?", a.ID).Update("two_factor_enabled", false)

	c.JSON(http.StatusOK, gin.H{"message": "2FA disabled"})
}

// ListSessions lists admin's active sessions
func (h *AuthHandler) ListSessions(c *gin.Context) {
	adminID := GetAdminID(c)
	var sessions []AdminSession
	DB.Where("admin_id = ? AND is_active = ?", adminID, true).Order("last_used desc").Find(&sessions)
	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

// RevokeSession revokes a session
func (h *AuthHandler) RevokeSession(c *gin.Context) {
	adminID := GetAdminID(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	result := DB.Model(&AdminSession{}).Where("id = ? AND admin_id = ?", id, adminID).Update("is_active", false)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "session revoked"})
}

// --- IP Allowlist (admin's own) ---

func (h *AuthHandler) ListIPAllowlist(c *gin.Context) {
	adminID := GetAdminID(c)
	var ips []AdminIPAllowlist
	DB.Where("admin_id = ?", adminID).Find(&ips)
	c.JSON(http.StatusOK, ips)
}

func (h *AuthHandler) AddIPAllowlist(c *gin.Context) {
	adminID := GetAdminID(c)
	var req struct {
		IP    string `json:"ip" binding:"required"`
		Label string `json:"label"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ip is required"})
		return
	}

	entry := AdminIPAllowlist{AdminID: adminID, IP: strings.TrimSpace(req.IP), Label: req.Label}
	DB.Create(&entry)
	c.JSON(http.StatusCreated, entry)
}

func (h *AuthHandler) DeleteIPAllowlist(c *gin.Context) {
	adminID := GetAdminID(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	var entry AdminIPAllowlist
	if err := DB.Where("id = ? AND admin_id = ?", id, adminID).First(&entry).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	DB.Delete(&entry)
	c.JSON(http.StatusOK, gin.H{"message": "IP removed"})
}

func (h *AuthHandler) ToggleIPRestriction(c *gin.Context) {
	adminID := GetAdminID(c)
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "enabled field required"})
		return
	}

	DB.Model(&Admin{}).Where("id = ?", adminID).Update("ip_restricted", req.Enabled)
	c.JSON(http.StatusOK, gin.H{"message": "IP restriction updated", "enabled": req.Enabled})
}
