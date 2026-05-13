package dashboard

import (
	"net/http"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type DashboardModule struct {
	core.BaseModule
}

func New() *DashboardModule { return &DashboardModule{} }

func (m *DashboardModule) ID() string   { return "dashboard" }
func (m *DashboardModule) Name() string { return "Dashboard" }
func (m *DashboardModule) Icon() string { return "DashboardOutlined" }

func (m *DashboardModule) Permissions() []core.Permission {
	return nil // Dashboard is always visible
}

func (m *DashboardModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "Dashboard", Path: "/dashboard", Icon: "DashboardOutlined"},
	}
}

func (m *DashboardModule) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/dashboard/stats", getStats)
	r.GET("/dashboard/activity", getRecentActivity)
}

func getStats(c *gin.Context) {
	var zoneCount, recordCount, tokenCount, apiKeyCount, banCount, adminCount int64

	models.DB.Model(&models.Zone{}).Count(&zoneCount)
	models.DB.Model(&models.Record{}).Count(&recordCount)
	models.DB.Model(&models.DDNSToken{}).Count(&tokenCount)
	models.DB.Model(&models.APIKey{}).Count(&apiKeyCount)
	models.DB.Model(&models.IPBan{}).Count(&banCount)
	core.DB.Model(&core.Admin{}).Count(&adminCount)

	c.JSON(http.StatusOK, gin.H{
		"zones":       zoneCount,
		"records":     recordCount,
		"ddns_tokens": tokenCount,
		"api_keys":    apiKeyCount,
		"ip_bans":     banCount,
		"admins":      adminCount,
	})
}

func getRecentActivity(c *gin.Context) {
	var logs []models.AuditLog
	models.DB.Order("created_at DESC").Limit(20).Find(&logs)
	c.JSON(http.StatusOK, gin.H{"activity": logs})
}
