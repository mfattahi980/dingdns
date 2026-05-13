package email

import (
	"github.com/dingdns/dingdns/internal/core"
	"github.com/gin-gonic/gin"
)

type EmailModule struct {
	core.BaseModule
	handler *Handler
}

func New() *EmailModule {
	return &EmailModule{handler: NewHandler()}
}

func (m *EmailModule) ID() string   { return "email" }
func (m *EmailModule) Name() string { return "Email" }
func (m *EmailModule) Icon() string { return "MailOutlined" }

func (m *EmailModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "email.view", Label: "View Email Settings", Description: "View SMTP configuration"},
		{Key: "email.manage", Label: "Manage Email", Description: "Edit SMTP settings and send test emails"},
	}
}

func (m *EmailModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "SMTP Settings", Path: "/email/settings", Icon: "SettingOutlined", Permission: "email.view"},
		{Label: "Test Email", Path: "/email/test", Icon: "SendOutlined", Permission: "email.manage"},
	}
}

func (m *EmailModule) RegisterRoutes(r *gin.RouterGroup) {
	e := r.Group("/email")
	{
		e.GET("/settings", core.RequirePermission("email.view"), m.handler.GetSettings)
		e.PUT("/settings", core.RequirePermission("email.manage"), m.handler.UpdateSettings)
		e.POST("/test", core.RequirePermission("email.manage"), m.handler.SendTestEmail)
	}
}
