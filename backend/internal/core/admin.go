package core

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Admin represents an admin user for the control panel
type Admin struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	Username         string         `gorm:"uniqueIndex;size:100;not null" json:"username"`
	Email            string         `gorm:"uniqueIndex;size:255;not null" json:"email"`
	Password         string         `gorm:"size:255;not null" json:"-"`
	Role             string         `gorm:"size:20;not null;default:admin" json:"role"` // super_admin, admin
	Permissions      string         `gorm:"size:2048;not null;default:*" json:"permissions"` // JSON array or "*" for all
	IsActive         bool           `gorm:"default:true" json:"is_active"`
	TwoFactorEnabled bool           `gorm:"default:false" json:"two_factor_enabled"`
	IPRestricted     bool           `gorm:"default:false" json:"ip_restricted"`
	FailedAttempts   int            `gorm:"default:0" json:"-"`
	LockedUntil      *time.Time     `json:"locked_until"`
	LastLogin        *time.Time     `json:"last_login"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
}

// SetPassword hashes and sets the admin password
func (a *Admin) SetPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12) // cost 12 for admin
	if err != nil {
		return err
	}
	a.Password = string(hash)
	return nil
}

// CheckPassword verifies a password against the stored hash
func (a *Admin) CheckPassword(password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(a.Password), []byte(password)) == nil
}

// IsSuperAdmin checks if this is the super admin
func (a *Admin) IsSuperAdmin() bool {
	return a.Role == "super_admin"
}

// IsLocked checks if the account is temporarily locked
func (a *Admin) IsLocked() bool {
	if a.LockedUntil == nil {
		return false
	}
	return time.Now().Before(*a.LockedUntil)
}

// HasPermission checks if admin has a specific permission
func (a *Admin) HasPermission(perm string) bool {
	if a.Role == "super_admin" || a.Permissions == "*" {
		return true
	}

	perms := ParsePermissions(a.Permissions)
	permSet := make(map[string]bool)
	for _, p := range perms {
		permSet[p] = true
	}

	if permSet[perm] {
		return true
	}

	return hasWildcard(perm, permSet)
}

// AdminSession tracks active admin sessions
type AdminSession struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	AdminID   uint      `gorm:"index;not null" json:"admin_id"`
	Token     string    `gorm:"uniqueIndex;size:128;not null" json:"-"`
	IP        string    `gorm:"size:45" json:"ip"`
	UserAgent string    `gorm:"size:512" json:"user_agent"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	LastUsed  time.Time `json:"last_used"`
}

// AdminIPAllowlist restricts admin login to specific IPs
type AdminIPAllowlist struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	AdminID   uint      `gorm:"index" json:"admin_id"` // 0 = global for all admins
	IP        string    `gorm:"size:45;not null" json:"ip"`
	Label     string    `gorm:"size:100" json:"label"`
	CreatedAt time.Time `json:"created_at"`
}

// TOTPSecret stores 2FA secret for an admin
type TOTPSecret struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	AdminID     uint      `gorm:"uniqueIndex;not null" json:"admin_id"`
	Secret      string    `gorm:"size:64;not null" json:"-"`
	IsEnabled   bool      `gorm:"default:false" json:"is_enabled"`
	BackupCodes string    `gorm:"size:512" json:"-"` // comma-separated
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
