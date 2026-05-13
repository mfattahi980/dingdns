package admins

import (
	"github.com/dingdns/dingdns/internal/core"
	"github.com/gin-gonic/gin"
)

type AdminsModule struct {
	core.BaseModule
	handler *Handler
}

func New() *AdminsModule {
	return &AdminsModule{handler: NewHandler()}
}

func (m *AdminsModule) ID() string   { return "admins" }
func (m *AdminsModule) Name() string { return "Admins" }
func (m *AdminsModule) Icon() string { return "TeamOutlined" }

func (m *AdminsModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "admins.view", Label: "View Admins", Description: "View admin users list"},
		{Key: "admins.manage", Label: "Manage Admins", Description: "Create, edit, and delete admin users"},
	}
}

func (m *AdminsModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "Admin Users", Path: "/admins", Icon: "TeamOutlined", Permission: "admins.view"},
	}
}

func (m *AdminsModule) RegisterRoutes(r *gin.RouterGroup) {
	a := r.Group("/admins")
	{
		a.GET("", core.RequirePermission("admins.view"), m.handler.List)
		a.POST("", core.RequirePermission("admins.manage"), m.handler.Create)
		a.PUT("/:id", core.RequirePermission("admins.manage"), m.handler.Update)
		a.DELETE("/:id", core.RequirePermission("admins.manage"), m.handler.Delete)
		a.GET("/permissions", core.RequirePermission("admins.view"), m.handler.ListPermissions)
	}
}
