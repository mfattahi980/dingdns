package audit

import (
	"net/http"
	"strconv"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type AuditModule struct {
	core.BaseModule
}

func New() *AuditModule { return &AuditModule{} }

func (m *AuditModule) ID() string   { return "audit" }
func (m *AuditModule) Name() string { return "Audit Log" }
func (m *AuditModule) Icon() string { return "AuditOutlined" }

func (m *AuditModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "audit.view", Label: "View Audit Logs", Description: "View system audit logs"},
		{Key: "audit.delete", Label: "Delete Audit Logs", Description: "Delete or clear audit log entries (super admin only)"},
	}
}

func (m *AuditModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "Audit Log", Path: "/audit", Icon: "AuditOutlined", Permission: "audit.view"},
	}
}

func (m *AuditModule) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/audit-logs", core.RequirePermission("audit.view"), listAuditLogs)
	r.DELETE("/audit-logs", core.RequireSuperAdmin(), clearAllAuditLogs)
	r.DELETE("/audit-logs/:id", core.RequireSuperAdmin(), deleteAuditLog)
}

func listAuditLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	action := c.Query("action")
	resource := c.Query("resource")
	search := c.Query("search")

	if page < 1 {
		page = 1
	}
	if perPage > 100 {
		perPage = 100
	}

	var logs []models.AuditLog
	var total int64

	query := models.DB.Model(&models.AuditLog{})
	if action != "" {
		query = query.Where("action LIKE ?", "%"+action+"%")
	}
	if resource != "" {
		query = query.Where("resource = ?", resource)
	}
	if search != "" {
		query = query.Where("details LIKE ? OR ip LIKE ?", "%"+search+"%", "%"+search+"%")
	}

	query.Count(&total)
	query.Order("created_at DESC").
		Offset((page - 1) * perPage).
		Limit(perPage).
		Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"logs": logs, "total": total,
		"page": page, "per_page": perPage,
	})
}

func deleteAuditLog(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	result := models.DB.Delete(&models.AuditLog{}, id)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "log entry not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Log entry deleted"})
}

func clearAllAuditLogs(c *gin.Context) {
	var count int64
	models.DB.Model(&models.AuditLog{}).Count(&count)
	models.DB.Where("1 = 1").Delete(&models.AuditLog{})
	c.JSON(http.StatusOK, gin.H{"message": "All audit logs cleared", "deleted": count})
}
