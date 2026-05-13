package admins

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
	var admins []core.Admin
	core.DB.Find(&admins)
	c.JSON(http.StatusOK, gin.H{"admins": admins, "total": len(admins)})
}

func (h *Handler) Create(c *gin.Context) {
	var req struct {
		Username    string   `json:"username" binding:"required"`
		Email       string   `json:"email" binding:"required,email"`
		Password    string   `json:"password" binding:"required,min=8"`
		Role        string   `json:"role"`
		Permissions []string `json:"permissions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username, email, and password (min 8) required"})
		return
	}

	// Only super_admin can create other super_admins
	role := req.Role
	if role == "" {
		role = "admin"
	}
	if role == "super_admin" {
		adminRole, _ := c.Get("admin_role")
		if adminRole != "super_admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "only super admin can create super admins"})
			return
		}
	}

	perms := "*"
	if len(req.Permissions) > 0 && role != "super_admin" {
		perms = core.EncodePermissions(req.Permissions)
	}

	admin := core.Admin{
		Username:    req.Username,
		Email:       req.Email,
		Role:        role,
		Permissions: perms,
		IsActive:    true,
	}

	if err := admin.SetPassword(req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	if err := core.DB.Create(&admin).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username or email already exists"})
		return
	}

	logAction(c, "create_admin", "admin", &admin.ID, req.Username)
	c.JSON(http.StatusCreated, admin)
}

func (h *Handler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var admin core.Admin
	if err := core.DB.First(&admin, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	}

	// Can't edit super_admin unless you are super_admin
	currentRole, _ := c.Get("admin_role")
	if admin.IsSuperAdmin() && currentRole != "super_admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot edit super admin"})
		return
	}

	var req struct {
		Email       *string  `json:"email"`
		Password    *string  `json:"password"`
		Role        *string  `json:"role"`
		Permissions []string `json:"permissions"`
		IsActive    *bool    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	updates := map[string]interface{}{}

	if req.Email != nil {
		updates["email"] = *req.Email
	}
	if req.Password != nil {
		if err := admin.SetPassword(*req.Password); err == nil {
			updates["password"] = admin.Password
		}
	}
	if req.Role != nil {
		if *req.Role == "super_admin" && currentRole != "super_admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "only super admin can promote to super admin"})
			return
		}
		updates["role"] = *req.Role
	}
	if req.Permissions != nil {
		updates["permissions"] = core.EncodePermissions(req.Permissions)
	}
	if req.IsActive != nil {
		// Can't deactivate yourself
		currentID := core.GetAdminID(c)
		if currentID == admin.ID && !*req.IsActive {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot deactivate yourself"})
			return
		}
		updates["is_active"] = *req.IsActive
	}

	if len(updates) > 0 {
		core.DB.Model(&admin).Updates(updates)
	}

	logAction(c, "update_admin", "admin", &admin.ID, "")
	core.DB.First(&admin, id)
	c.JSON(http.StatusOK, admin)
}

func (h *Handler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var admin core.Admin
	if err := core.DB.First(&admin, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	}

	// Can't delete super_admin
	if admin.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot delete super admin"})
		return
	}

	// Can't delete yourself
	currentID := core.GetAdminID(c)
	if currentID == admin.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete yourself"})
		return
	}

	// Revoke all sessions
	core.DB.Model(&core.AdminSession{}).Where("admin_id = ?", admin.ID).Update("is_active", false)
	core.DB.Delete(&admin)

	logAction(c, "delete_admin", "admin", &admin.ID, admin.Username)
	c.JSON(http.StatusOK, gin.H{"message": "admin deleted"})
}

// ListPermissions returns all available permissions from all modules
func (h *Handler) ListPermissions(c *gin.Context) {
	perms := core.GetAllPermissions()
	c.JSON(http.StatusOK, gin.H{"permissions": perms})
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
