package alerts

import (
	"net/http"
	"strconv"
	"time"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AlertRule defines when to trigger an alert
type AlertRule struct {
	ID          uint    `gorm:"primaryKey" json:"id"`
	Name        string  `gorm:"size:100;not null" json:"name"`
	Type        string  `gorm:"size:50;not null" json:"type"` // cpu, ram, disk, service, errors
	Threshold   float64 `gorm:"default:90" json:"threshold"`
	IsEnabled   bool    `gorm:"default:true" json:"is_enabled"`
	NotifyEmail bool    `gorm:"default:false" json:"notify_email"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Alert represents an active or historical alert
type Alert struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	RuleID     uint       `gorm:"index" json:"rule_id"`
	Message    string     `gorm:"size:512;not null" json:"message"`
	Severity   string     `gorm:"size:20;not null;default:warning" json:"severity"` // info, warning, critical
	IsActive   bool       `gorm:"default:true;index" json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
	ResolvedAt *time.Time `json:"resolved_at"`
}

type AlertsModule struct {
	core.BaseModule
}

func New() *AlertsModule { return &AlertsModule{} }

func (m *AlertsModule) ID() string   { return "alerts" }
func (m *AlertsModule) Name() string { return "Alerts" }
func (m *AlertsModule) Icon() string { return "AlertOutlined" }

func (m *AlertsModule) Models() []interface{} {
	return []interface{}{&AlertRule{}, &Alert{}}
}

func (m *AlertsModule) OnInit() error {
	// Create default alert rules if none exist
	var count int64
	core.DB.Model(&AlertRule{}).Count(&count)
	if count == 0 {
		defaults := []AlertRule{
			{Name: "High CPU Usage", Type: "cpu", Threshold: 90, IsEnabled: true},
			{Name: "High RAM Usage", Type: "ram", Threshold: 90, IsEnabled: true},
			{Name: "Disk Almost Full", Type: "disk", Threshold: 85, IsEnabled: true},
			{Name: "DNS Server Down", Type: "service_dns", Threshold: 0, IsEnabled: true},
		}
		for _, r := range defaults {
			core.DB.Create(&r)
		}
	}
	return nil
}

func (m *AlertsModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "alerts.view", Label: "View Alerts", Description: "View active and historical alerts"},
		{Key: "alerts.manage", Label: "Manage Alerts", Description: "Configure alert rules"},
	}
}

func (m *AlertsModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "Active Alerts", Path: "/alerts/active", Icon: "AlertOutlined", Permission: "alerts.view"},
		{Label: "Alert Rules", Path: "/alerts/rules", Icon: "SettingOutlined", Permission: "alerts.manage"},
		{Label: "History", Path: "/alerts/history", Icon: "HistoryOutlined", Permission: "alerts.view"},
	}
}

func (m *AlertsModule) RegisterRoutes(r *gin.RouterGroup) {
	a := r.Group("/alerts")
	{
		a.GET("/active", core.RequirePermission("alerts.view"), listActiveAlerts)
		a.GET("/history", core.RequirePermission("alerts.view"), listAlertHistory)
		a.GET("/rules", core.RequirePermission("alerts.view"), listAlertRules)
		a.PUT("/rules/:id", core.RequirePermission("alerts.manage"), updateAlertRule)
		a.POST("/resolve/:id", core.RequirePermission("alerts.manage"), resolveAlert)
	}
}

func listActiveAlerts(c *gin.Context) {
	var alerts []Alert
	models.DB.Where("is_active = ?", true).Order("created_at desc").Find(&alerts)
	c.JSON(http.StatusOK, gin.H{"alerts": alerts, "total": len(alerts)})
}

func listAlertHistory(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage := 50

	var alerts []Alert
	var total int64
	models.DB.Model(&Alert{}).Count(&total)
	models.DB.Order("created_at desc").Offset((page-1)*perPage).Limit(perPage).Find(&alerts)
	c.JSON(http.StatusOK, gin.H{"alerts": alerts, "total": total, "page": page})
}

func listAlertRules(c *gin.Context) {
	var rules []AlertRule
	models.DB.Find(&rules)
	c.JSON(http.StatusOK, gin.H{"rules": rules})
}

func updateAlertRule(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	var rule AlertRule
	if err := models.DB.First(&rule, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}

	var req struct {
		IsEnabled   *bool    `json:"is_enabled"`
		Threshold   *float64 `json:"threshold"`
		NotifyEmail *bool    `json:"notify_email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	updates := map[string]interface{}{}
	if req.IsEnabled != nil {
		updates["is_enabled"] = *req.IsEnabled
	}
	if req.Threshold != nil {
		updates["threshold"] = *req.Threshold
	}
	if req.NotifyEmail != nil {
		updates["notify_email"] = *req.NotifyEmail
	}

	if len(updates) > 0 {
		models.DB.Model(&rule).Updates(updates)
	}

	models.DB.First(&rule, id)
	c.JSON(http.StatusOK, rule)
}

func resolveAlert(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	now := time.Now()
	result := models.DB.Model(&Alert{}).Where("id = ? AND is_active = ?", id, true).
		Updates(map[string]interface{}{"is_active": false, "resolved_at": &now})

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert not found or already resolved"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "alert resolved"})
}

// Ensure Alert and AlertRule use the models.DB (same database)
func init() {
	// This will be handled by the Models() method returning them for migration
	_ = gorm.Model{}
}
