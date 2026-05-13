package models

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"gorm.io/gorm"
)

// DDNSToken represents a token for Dynamic DNS updates
type DDNSToken struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	RecordID  uint           `gorm:"index;not null" json:"record_id"`
	Token     string         `gorm:"uniqueIndex;size:64;not null" json:"token"`
	Label     string         `gorm:"size:100" json:"label"`
	LastUsed  *time.Time     `json:"last_used"`
	LastIP    string         `gorm:"size:45" json:"last_ip"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Record Record `gorm:"foreignKey:RecordID" json:"record,omitempty"`
}

// GenerateToken creates a cryptographically secure random token
func GenerateToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
