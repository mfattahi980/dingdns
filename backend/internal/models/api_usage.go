package models

import "time"

// APIUsageLog records each API key request
type APIUsageLog struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	APIKeyID     uint      `gorm:"index;not null" json:"api_key_id"`
	APIKeyName   string    `gorm:"size:100" json:"api_key_name"`
	Method       string    `gorm:"size:10" json:"method"`
	Path         string    `gorm:"size:500" json:"path"`
	StatusCode   int       `json:"status_code"`
	DurationMs   int64     `json:"duration_ms"`
	IP           string    `gorm:"size:45" json:"ip"`
	UserAgent    string    `gorm:"size:300" json:"user_agent"`
	CreatedAt    time.Time `gorm:"index" json:"created_at"`
}
