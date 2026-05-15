package security

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) ListIPBans(c *gin.Context) {
	var bans []models.IPBan
	models.DB.Order("created_at desc").Find(&bans)
	c.JSON(http.StatusOK, bans)
}

func (h *Handler) AddIPBan(c *gin.Context) {
	var req struct {
		IP        string `json:"ip" binding:"required"`
		Reason    string `json:"reason"`
		ExpiresIn int    `json:"expires_in"` // minutes, 0=permanent
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ip is required"})
		return
	}

	ban := models.IPBan{IP: strings.TrimSpace(req.IP), Reason: req.Reason}
	if req.ExpiresIn > 0 {
		exp := time.Now().Add(time.Duration(req.ExpiresIn) * time.Minute)
		ban.ExpiresAt = &exp
	}

	if err := models.DB.Create(&ban).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to ban IP"})
		return
	}

	logAction(c, "ban_ip", "ip_ban", &ban.ID, req.IP)
	c.JSON(http.StatusCreated, ban)
}

func (h *Handler) DeleteIPBan(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

	var ban models.IPBan
	if err := models.DB.First(&ban, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ban not found"})
		return
	}

	// If a firewall rule was attached (auto-ban with firewall mode), remove it too.
	fwRemoved := false
	if ban.FirewallRule != nil && *ban.FirewallRule > 0 {
		fwRemoved = core.RemoveAutoFirewallRule(*ban.FirewallRule)
	}

	models.DB.Delete(&ban)
	logAction(c, "unban_ip", "ip_ban", &ban.ID, ban.IP)

	resp := gin.H{"message": "IP unbanned", "ip": ban.IP}
	if ban.FirewallRule != nil && *ban.FirewallRule > 0 {
		resp["firewall_rule_removed"] = fwRemoved
	}
	c.JSON(http.StatusOK, resp)
}

// ListSuspiciousEvents returns paginated suspicious events.
// Query params:
//   - page       (default 1)
//   - per_page   (default 50, max 200)
//   - ip         (filter by IP)
//   - event_type (filter)
//   - banned     ("true" / "false")
func (h *Handler) ListSuspiciousEvents(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	if perPage < 1 || perPage > 200 {
		perPage = 50
	}
	offset := (page - 1) * perPage

	q := models.DB.Model(&models.SuspiciousEvent{})
	if ip := strings.TrimSpace(c.Query("ip")); ip != "" {
		q = q.Where("ip = ?", ip)
	}
	if et := strings.TrimSpace(c.Query("event_type")); et != "" {
		q = q.Where("event_type = ?", et)
	}
	if b := strings.TrimSpace(c.Query("banned")); b == "true" {
		q = q.Where("banned = ?", true)
	} else if b == "false" {
		q = q.Where("banned = ?", false)
	}

	var total int64
	q.Count(&total)

	var events []models.SuspiciousEvent
	q.Order("created_at desc").Offset(offset).Limit(perPage).Find(&events)

	// Aggregate stats for the dashboard.
	type byTypeRow struct {
		EventType string `json:"event_type"`
		Count     int64  `json:"count"`
	}
	var byType []byTypeRow
	models.DB.Raw(`
		SELECT event_type, COUNT(*) AS count
		FROM suspicious_events
		WHERE created_at >= ?
		GROUP BY event_type
		ORDER BY count DESC
	`, time.Now().Add(-24*time.Hour)).Scan(&byType)

	type topIPRow struct {
		IP    string `json:"ip"`
		Count int64  `json:"count"`
	}
	var topIPs []topIPRow
	models.DB.Raw(`
		SELECT ip, COUNT(*) AS count
		FROM suspicious_events
		WHERE created_at >= ?
		GROUP BY ip
		ORDER BY count DESC
		LIMIT 10
	`, time.Now().Add(-24*time.Hour)).Scan(&topIPs)

	c.JSON(http.StatusOK, gin.H{
		"data":     events,
		"total":    total,
		"page":     page,
		"per_page": perPage,
		"stats": gin.H{
			"by_type_24h": byType,
			"top_ips_24h": topIPs,
		},
	})
}

// ClearSuspiciousEvents truncates the suspicious_events table.
func (h *Handler) ClearSuspiciousEvents(c *gin.Context) {
	var count int64
	models.DB.Model(&models.SuspiciousEvent{}).Count(&count)
	models.DB.Where("1 = 1").Delete(&models.SuspiciousEvent{})
	logAction(c, "clear_suspicious_events", "security", nil, "cleared all suspicious events")
	c.JSON(http.StatusOK, gin.H{"message": "All suspicious events cleared", "deleted": count})
}

func (h *Handler) ListLoginAttempts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage := 50
	offset := (page - 1) * perPage

	var total int64
	models.DB.Model(&models.LoginAttempt{}).Count(&total)

	var attempts []models.LoginAttempt
	models.DB.Order("created_at desc").Offset(offset).Limit(perPage).Find(&attempts)

	c.JSON(http.StatusOK, gin.H{"data": attempts, "total": total, "page": page})
}

func (h *Handler) ClearLoginAttempts(c *gin.Context) {
	var count int64
	models.DB.Model(&models.LoginAttempt{}).Count(&count)
	models.DB.Where("1 = 1").Delete(&models.LoginAttempt{})
	logAction(c, "clear_login_attempts", "security", nil, "cleared all login attempts")
	c.JSON(http.StatusOK, gin.H{"message": "All login attempts cleared", "deleted": count})
}

func logAction(c *gin.Context, action, resource string, resourceID *uint, details string) {
	adminID := core.GetAdminID(c)
	var aidPtr *uint
	if adminID > 0 {
		aidPtr = &adminID
	}
	log := models.AuditLog{
		UserID: aidPtr, Action: action, Resource: resource,
		ResourceID: resourceID, Details: details, IP: c.ClientIP(),
	}
	models.DB.Create(&log)
}
