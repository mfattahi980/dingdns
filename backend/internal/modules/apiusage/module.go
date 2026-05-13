package apiusage

import (
	"net/http"
	"strconv"
	"time"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type APIUsageModule struct {
	core.BaseModule
}

func New() *APIUsageModule { return &APIUsageModule{} }

func (m *APIUsageModule) ID() string   { return "apiusage" }
func (m *APIUsageModule) Name() string { return "API Usage" }
func (m *APIUsageModule) Icon() string { return "ApiOutlined" }

func (m *APIUsageModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "apiusage.view", Label: "View API Usage", Description: "View API key usage logs and statistics"},
	}
}

// No menu items — accessed via API Keys section
func (m *APIUsageModule) MenuItems() []core.MenuItem { return nil }

func (m *APIUsageModule) RegisterRoutes(r *gin.RouterGroup) {
	u := r.Group("/api-usage")
	{
		u.GET("", core.RequirePermission("apiusage.view"), getUsageLogs)
		u.GET("/stats", core.RequirePermission("apiusage.view"), getUsageStats)
		u.DELETE("", core.RequireSuperAdmin(), clearUsageLogs)
	}
}

func getUsageLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	apiKeyID := c.Query("api_key_id")
	method := c.Query("method")
	statusCode := c.Query("status_code")

	if page < 1 {
		page = 1
	}
	if perPage > 200 {
		perPage = 200
	}

	var logs []models.APIUsageLog
	var total int64

	q := models.DB.Model(&models.APIUsageLog{})
	if apiKeyID != "" {
		q = q.Where("api_key_id = ?", apiKeyID)
	}
	if method != "" {
		q = q.Where("method = ?", method)
	}
	if statusCode != "" {
		q = q.Where("status_code = ?", statusCode)
	}

	q.Count(&total)
	q.Order("created_at DESC").
		Offset((page - 1) * perPage).
		Limit(perPage).
		Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"logs": logs, "total": total,
		"page": page, "per_page": perPage,
	})
}

func getUsageStats(c *gin.Context) {
	hours, _ := strconv.Atoi(c.DefaultQuery("hours", "24"))
	if hours < 1 {
		hours = 24
	}
	if hours > 720 {
		hours = 720
	}

	since := time.Now().Add(-time.Duration(hours) * time.Hour)

	var total int64
	models.DB.Model(&models.APIUsageLog{}).Where("created_at > ?", since).Count(&total)

	var errors int64
	models.DB.Model(&models.APIUsageLog{}).
		Where("created_at > ? AND status_code >= 400", since).Count(&errors)

	// Top API keys by request count
	type KeyStat struct {
		APIKeyID   uint   `json:"api_key_id"`
		APIKeyName string `json:"api_key_name"`
		Requests   int64  `json:"requests"`
	}
	var topKeys []KeyStat
	models.DB.Model(&models.APIUsageLog{}).
		Select("api_key_id, api_key_name, count(*) as requests").
		Where("created_at > ?", since).
		Group("api_key_id, api_key_name").
		Order("requests DESC").
		Limit(10).
		Scan(&topKeys)

	// Top paths
	type PathStat struct {
		Path     string `json:"path"`
		Requests int64  `json:"requests"`
	}
	var topPaths []PathStat
	models.DB.Model(&models.APIUsageLog{}).
		Select("path, count(*) as requests").
		Where("created_at > ?", since).
		Group("path").
		Order("requests DESC").
		Limit(10).
		Scan(&topPaths)

	// Avg response time
	type AvgDur struct {
		Avg float64 `json:"avg"`
	}
	var avgDur AvgDur
	models.DB.Model(&models.APIUsageLog{}).
		Select("AVG(duration_ms) as avg").
		Where("created_at > ?", since).
		Scan(&avgDur)

	// Total log count
	var allTime int64
	models.DB.Model(&models.APIUsageLog{}).Count(&allTime)

	c.JSON(http.StatusOK, gin.H{
		"period_hours":   hours,
		"total_requests": total,
		"total_errors":   errors,
		"error_rate":     func() float64 {
			if total == 0 {
				return 0
			}
			return float64(errors) / float64(total) * 100
		}(),
		"avg_duration_ms": avgDur.Avg,
		"top_keys":        topKeys,
		"top_paths":       topPaths,
		"all_time_total":  allTime,
		"logging_enabled": core.GetSetting("api_usage_log_enabled") != "false",
	})
}

func clearUsageLogs(c *gin.Context) {
	var count int64
	models.DB.Model(&models.APIUsageLog{}).Count(&count)
	models.DB.Where("1 = 1").Delete(&models.APIUsageLog{})
	c.JSON(http.StatusOK, gin.H{"message": "API usage logs cleared", "deleted": count})
}
