package email

import (
	"fmt"
	"net/http"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/mailer"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) GetSettings(c *gin.Context) {
	keys := []string{"smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from", "smtp_tls"}
	settings := map[string]string{
		"smtp_host":     "",
		"smtp_port":     "587",
		"smtp_username": "",
		"smtp_password": "",
		"smtp_from":     "",
		"smtp_tls":      "false",
	}

	var rows []models.Setting
	models.DB.Where("key IN ?", keys).Find(&rows)
	for _, row := range rows {
		settings[row.Key] = row.Value
	}

	c.JSON(http.StatusOK, settings)
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	allowed := map[string]bool{
		"smtp_host": true, "smtp_port": true, "smtp_username": true,
		"smtp_password": true, "smtp_from": true, "smtp_tls": true,
	}

	for k, v := range req {
		if !allowed[k] {
			continue
		}
		core.SetSetting(k, v)
	}

	adminID := core.GetAdminID(c)
	var aidPtr *uint
	if adminID > 0 {
		aidPtr = &adminID
	}
	models.DB.Create(&models.AuditLog{
		UserID: aidPtr, Action: "update_email_settings", Resource: "setting",
		Details: "", IP: c.ClientIP(),
	})

	c.JSON(http.StatusOK, gin.H{"message": "email settings updated"})
}

func (h *Handler) SendTestEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "valid email is required"})
		return
	}

	if err := mailer.SendTestEmail(req.Email); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("failed to send: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "test email sent successfully"})
}
