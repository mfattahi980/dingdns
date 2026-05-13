package apikeys

import (
	"github.com/dingdns/dingdns/internal/core"
	"github.com/gin-gonic/gin"
)

type APIKeysModule struct {
	core.BaseModule
	handler *Handler
}

func New() *APIKeysModule {
	return &APIKeysModule{handler: NewHandler()}
}

func (m *APIKeysModule) ID() string   { return "apikeys" }
func (m *APIKeysModule) Name() string { return "API Keys" }
func (m *APIKeysModule) Icon() string { return "KeyOutlined" }

func (m *APIKeysModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "apikeys.view", Label: "View API Keys", Description: "View API keys"},
		{Key: "apikeys.manage", Label: "Manage API Keys", Description: "Create, edit, and delete API keys"},
	}
}

func (m *APIKeysModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "API Keys", Path: "/apikeys", Icon: "KeyOutlined", Permission: "apikeys.view"},
		{Label: "API Usage", Path: "/apikeys/usage", Icon: "ApiOutlined", Permission: "apiusage.view"},
	}
}

func (m *APIKeysModule) RegisterRoutes(r *gin.RouterGroup) {
	keys := r.Group("/api-keys")
	{
		keys.GET("", core.RequirePermission("apikeys.view"), m.handler.List)
		keys.POST("", core.RequirePermission("apikeys.manage"), m.handler.Create)
		keys.PUT("/:id", core.RequirePermission("apikeys.manage"), m.handler.Update)
		keys.DELETE("/:id", core.RequirePermission("apikeys.manage"), m.handler.Delete)
	}
}
