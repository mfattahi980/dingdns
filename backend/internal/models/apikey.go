package models

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"gorm.io/gorm"
)

// APIKey represents an authorized client application
type APIKey struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	Name           string         `gorm:"size:100;not null" json:"name"`
	Key            string         `gorm:"uniqueIndex;size:64;not null" json:"key"`
	AllowedOrigins string         `gorm:"size:1024" json:"allowed_origins"` // comma-separated origins
	AllowedIPs     string         `gorm:"size:2048" json:"allowed_ips"`     // comma-separated IPs/CIDRs
	IsActive       bool           `gorm:"default:true" json:"is_active"`
	LastUsed       *time.Time     `json:"last_used"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// GenerateAPIKey creates a cryptographically secure API key
func GenerateAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "dk_" + hex.EncodeToString(b), nil // dk_ prefix = dingdns key
}
