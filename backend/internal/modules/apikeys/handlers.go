package apikeys

import (
	"net/http"
	"strconv"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) List(c *gin.Context) {
	var keys []models.APIKey
	models.DB.Order("created_at desc").Find(&keys)
	c.JSON(http.StatusOK, keys)
}

func (h *Handler) Create(c *gin.Context) {
	var req struct {
		Name           string `json:"name" binding:"required"`
		AllowedOrigins string `json:"allowed_origins"`
		AllowedIPs     string `json:"allowed_ips"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	key, err := models.GenerateAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate key"})
		return
	}

	apiKey := models.APIKey{
		Name: req.Name, Key: key,
		AllowedOrigins: req.AllowedOrigins,
		AllowedIPs:     req.AllowedIPs,
		IsActive:       true,
	}

	if err := models.DB.Create(&apiKey).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create API key"})
		return
	}

	logAction(c, "create_api_key", "api_key", &apiKey.ID, req.Name)
	c.JSON(http.StatusCreated, apiKey)
}

func (h *Handler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var key models.APIKey
	if err := models.DB.First(&key, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}

	var req struct {
		Name           *string `json:"name"`
		AllowedOrigins *string `json:"allowed_origins"`
		AllowedIPs     *string `json:"allowed_ips"`
		IsActive       *bool   `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.AllowedOrigins != nil {
		updates["allowed_origins"] = *req.AllowedOrigins
	}
	if req.AllowedIPs != nil {
		updates["allowed_ips"] = *req.AllowedIPs
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	if len(updates) > 0 {
		models.DB.Model(&key).Updates(updates)
	}

	logAction(c, "update_api_key", "api_key", &key.ID, "")
	models.DB.First(&key, id)
	c.JSON(http.StatusOK, key)
}

func (h *Handler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var key models.APIKey
	if err := models.DB.First(&key, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}

	models.DB.Delete(&key)
	logAction(c, "delete_api_key", "api_key", &key.ID, key.Name)
	c.JSON(http.StatusOK, gin.H{"message": "API key deleted"})
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
