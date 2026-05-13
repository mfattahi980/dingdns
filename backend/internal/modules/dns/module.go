package dns

import (
	"github.com/dingdns/dingdns/internal/core"
	"github.com/gin-gonic/gin"
)

type DNSModule struct {
	core.BaseModule
	handler *Handler
}

func New() *DNSModule {
	return &DNSModule{
		handler: NewHandler(),
	}
}

func (m *DNSModule) OnInit() error {
	StartAutoRenewLoop()
	return nil
}

func (m *DNSModule) ID() string { return "dns" }
func (m *DNSModule) Name() string { return "DNS Management" }
func (m *DNSModule) Icon() string { return "GlobalOutlined" }

func (m *DNSModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "dns.view", Label: "View Zones & Records", Description: "View DNS zones and records"},
		{Key: "dns.create", Label: "Create Zones & Records", Description: "Create new DNS zones and records"},
		{Key: "dns.edit", Label: "Edit Zones & Records", Description: "Edit existing DNS zones and records"},
		{Key: "dns.delete", Label: "Delete Zones & Records", Description: "Delete DNS zones and records"},
		{Key: "ddns.view", Label: "View DDNS Tokens", Description: "View DDNS tokens"},
		{Key: "ddns.manage", Label: "Manage DDNS Tokens", Description: "Create and delete DDNS tokens"},
	}
}

func (m *DNSModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "Zones", Path: "/dns/zones", Icon: "GlobalOutlined", Permission: "dns.view"},
		{Label: "DDNS Tokens", Path: "/dns/ddns", Icon: "SwapOutlined", Permission: "ddns.view"},
		{Label: "DNS Test", Path: "/dns/test", Icon: "SearchOutlined", Permission: "dns.view"},
	}
}

func (m *DNSModule) RegisterRoutes(r *gin.RouterGroup) {
	// Zones
	zones := r.Group("/zones")
	{
		zones.GET("", core.RequirePermission("dns.view"), m.handler.ListZones)
		zones.GET("/:id", core.RequirePermission("dns.view"), m.handler.GetZone)
		zones.POST("", core.RequirePermission("dns.create"), m.handler.CreateZone)
		zones.PUT("/:id", core.RequirePermission("dns.edit"), m.handler.UpdateZone)
		zones.DELETE("/:id", core.RequirePermission("dns.delete"), m.handler.DeleteZone)
	}

	// Records
	records := r.Group("/records")
	{
		records.GET("/zone/:id", core.RequirePermission("dns.view"), m.handler.ListRecords)
		records.POST("/zone/:id", core.RequirePermission("dns.create"), m.handler.CreateRecord)
		records.PUT("/:id", core.RequirePermission("dns.edit"), m.handler.UpdateRecord)
		records.DELETE("/:id", core.RequirePermission("dns.delete"), m.handler.DeleteRecord)
	}

	// DDNS Tokens
	ddns := r.Group("/ddns-tokens")
	{
		ddns.GET("", core.RequirePermission("ddns.view"), m.handler.ListDDNSTokens)
		ddns.POST("", core.RequirePermission("ddns.manage"), m.handler.CreateDDNSToken)
		ddns.PUT("/:id", core.RequirePermission("ddns.manage"), m.handler.UpdateDDNSToken)
		ddns.DELETE("/:id", core.RequirePermission("ddns.manage"), m.handler.DeleteDDNSToken)
	}

	// DNS Testing & Server Identity
	r.GET("/dns-test", core.RequirePermission("dns.view"), TestDNS)
	r.GET("/server-info", core.RequirePermission("dns.view"), GetServerInfo)
	r.POST("/server-info/detect-ip", core.RequirePermission("dns.edit"), DetectServerIP)

	// DNS Cache control
	r.GET("/dns/cache-status", core.RequirePermission("dns.view"), GetCacheStatus)
	r.POST("/dns/reload", core.RequirePermission("dns.edit"), ManualReload)

	// SSL Management
	r.GET("/ssl/status", core.RequirePermission("server.manage"), CheckSSLStatus)
	r.POST("/ssl/issue", core.RequirePermission("server.manage"), IssueSSLCert)
	r.GET("/ssl/job/:id", core.RequirePermission("server.manage"), GetSSLJob)
	r.POST("/ssl/renew", core.RequirePermission("server.manage"), RenewSSLCert)
	r.GET("/ssl/auto-renew", core.RequirePermission("server.manage"), GetSSLAutoRenewStatus)
}

// RegisterPublicRoutes for API-key protected endpoints (used by frontend sites)
func (m *DNSModule) RegisterPublicRoutes(r *gin.RouterGroup) {
	// These are the API endpoints that external frontends use
	r.GET("/zones", m.handler.ListZones)
	r.GET("/zones/:id", m.handler.GetZone)
	r.POST("/zones", m.handler.CreateZone)
	r.PUT("/zones/:id", m.handler.UpdateZone)
	r.DELETE("/zones/:id", m.handler.DeleteZone)

	records := r.Group("/records")
	{
		records.GET("/zone/:id", m.handler.ListRecords)
		records.POST("/zone/:id", m.handler.CreateRecord)
		records.PUT("/:id", m.handler.UpdateRecord)
		records.DELETE("/:id", m.handler.DeleteRecord)
	}

	ddns := r.Group("/ddns/tokens")
	{
		ddns.GET("", m.handler.ListDDNSTokens)
		ddns.POST("", m.handler.CreateDDNSToken)
		ddns.DELETE("/:id", m.handler.DeleteDDNSToken)
	}
}
