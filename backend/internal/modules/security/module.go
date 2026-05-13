package security

import (
	"github.com/dingdns/dingdns/internal/core"
	"github.com/gin-gonic/gin"
)

type SecurityModule struct {
	core.BaseModule
	handler *Handler
}

func New() *SecurityModule {
	return &SecurityModule{handler: NewHandler()}
}

func (m *SecurityModule) ID() string   { return "security" }
func (m *SecurityModule) Name() string { return "Security" }
func (m *SecurityModule) Icon() string { return "SafetyOutlined" }

func (m *SecurityModule) OnInit() error {
	// Re-apply all saved firewall rules on startup
	ApplyAllFirewallRules()
	return nil
}

func (m *SecurityModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "security.view", Label: "View Security", Description: "View IP bans and login attempts"},
		{Key: "security.manage", Label: "Manage Security", Description: "Add/remove IP bans, manage rate limiting"},
		{Key: "security.firewall", Label: "Manage Firewall", Description: "View and manage system firewall rules"},
	}
}

func (m *SecurityModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "IP Bans", Path: "/security/ip-bans", Icon: "StopOutlined", Permission: "security.view"},
		{Label: "Login Attempts", Path: "/security/login-attempts", Icon: "LoginOutlined", Permission: "security.view"},
		{Label: "Firewall", Path: "/security/firewall", Icon: "FireOutlined", Permission: "security.firewall"},
	}
}

func (m *SecurityModule) RegisterRoutes(r *gin.RouterGroup) {
	bans := r.Group("/ip-bans")
	{
		bans.GET("", core.RequirePermission("security.view"), m.handler.ListIPBans)
		bans.POST("", core.RequirePermission("security.manage"), m.handler.AddIPBan)
		bans.DELETE("/:id", core.RequirePermission("security.manage"), m.handler.DeleteIPBan)
	}

	r.GET("/login-attempts", core.RequirePermission("security.view"), m.handler.ListLoginAttempts)
	r.DELETE("/login-attempts", core.RequireSuperAdmin(), m.handler.ClearLoginAttempts)

	// Firewall management
	fw := r.Group("/firewall")
	{
		fw.GET("/rules", core.RequirePermission("security.firewall"), m.handler.ListFirewallRules)
		fw.POST("/rules", core.RequirePermission("security.firewall"), m.handler.AddFirewallRule)
		fw.DELETE("/rules/:id", core.RequirePermission("security.firewall"), m.handler.DeleteFirewallRule)
		fw.GET("/system", core.RequirePermission("security.firewall"), m.handler.GetSystemRules)
		fw.POST("/sync", core.RequirePermission("security.firewall"), m.handler.SyncFirewallRules)
	}
}
