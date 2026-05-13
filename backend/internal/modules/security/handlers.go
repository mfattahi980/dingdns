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

	models.DB.Delete(&ban)
	logAction(c, "unban_ip", "ip_ban", &ban.ID, ban.IP)
	c.JSON(http.StatusOK, gin.H{"message": "IP unbanned"})
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
