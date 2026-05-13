package settings

import (
	"net/http"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type SettingsModule struct {
	core.BaseModule
}

func New() *SettingsModule { return &SettingsModule{} }

func (m *SettingsModule) ID() string   { return "settings" }
func (m *SettingsModule) Name() string { return "Settings" }
func (m *SettingsModule) Icon() string { return "SettingOutlined" }

func (m *SettingsModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "settings.view", Label: "View Settings", Description: "View system settings"},
		{Key: "settings.manage", Label: "Manage Settings", Description: "Change system settings"},
	}
}

func (m *SettingsModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "General", Path: "/settings/general", Icon: "SettingOutlined", Permission: "settings.view"},
		{Label: "Security", Path: "/settings/security", Icon: "SafetyOutlined", Permission: "settings.manage"},
		{Label: "DNS Cache", Path: "/settings/dns-cache", Icon: "DatabaseOutlined", Permission: "settings.manage"},
	}
}

func (m *SettingsModule) RegisterRoutes(r *gin.RouterGroup) {
	s := r.Group("/settings")
	{
		s.GET("", core.RequirePermission("settings.view"), getSettings)
		s.PUT("", core.RequirePermission("settings.manage"), updateSettings)
	}
}

func getSettings(c *gin.Context) {
	defaults := map[string]string{
		// General
		"base_url":         "",
		"api_domain":       "",
		"maintenance_mode": "false",
		// Server Identity
		"server_domain": "",
		"server_ip":     "",
		"ns1_hostname":  "",
		"ns2_hostname":  "",
		// Admin security
		"admin_captcha_enabled":  "false",
		"admin_session_timeout":  "1440",
		"admin_2fa_required":     "false",
		"admin_lockout_attempts": "5",
		"admin_lockout_duration": "15",
		// Frontend/public
		"captcha_enabled":            "false",
		"registration_enabled":       "false",
		"email_verification_enabled": "false",
		// DNS Cache
		"dns_auto_reload":     "true",
		"dns_reload_debounce": "500",
		"dns_reload_interval": "30",
		// SSL & Access
		"ssl_redirect_http":     "true",
		"ssl_allow_http_port":   "true",
		"ssl_auto_renew":        "false",
		"ssl_renew_days_before": "30",
		// API Usage Logging
		"api_usage_log_enabled":        "true",
		"api_usage_log_retention_days": "30",
	}

	var rows []models.Setting
	models.DB.Find(&rows)
	for _, row := range rows {
		if _, ok := defaults[row.Key]; ok {
			defaults[row.Key] = row.Value
		}
	}

	c.JSON(http.StatusOK, defaults)
}

func updateSettings(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	allowed := map[string]bool{
		"base_url": true, "api_domain": true, "maintenance_mode": true,
		"server_domain": true, "server_ip": true,
		"ns1_hostname": true, "ns2_hostname": true,
		"admin_captcha_enabled": true, "admin_session_timeout": true,
		"admin_2fa_required": true, "admin_lockout_attempts": true,
		"admin_lockout_duration": true,
		"captcha_enabled": true, "registration_enabled": true,
		"email_verification_enabled": true,
		"dns_auto_reload": true, "dns_reload_debounce": true,
		"dns_reload_interval": true,
		// SSL & Access
		"ssl_redirect_http": true, "ssl_allow_http_port": true,
		"ssl_auto_renew": true, "ssl_renew_days_before": true,
		// API Usage Logging
		"api_usage_log_enabled": true, "api_usage_log_retention_days": true,
	}

	for k, v := range req {
		if !allowed[k] {
			continue
		}
		core.SetSetting(k, v)
	}

	adminID := core.GetAdminID(c)
	var aidPtr *uint
	if adminID > 0 {
		aidPtr = &adminID
	}
	models.DB.Create(&models.AuditLog{
		UserID: aidPtr, Action: "update_settings", Resource: "setting",
		Details: "", IP: c.ClientIP(),
	})

	c.JSON(http.StatusOK, gin.H{"message": "settings updated"})
}
