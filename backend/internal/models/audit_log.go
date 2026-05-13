package models

import "time"

// AuditLog tracks all important actions in the system
type AuditLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    *uint     `gorm:"index" json:"user_id"`
	Action    string    `gorm:"size:50;not null" json:"action"` // login, create_zone, update_record, ddns_update, etc.
	Resource  string    `gorm:"size:50" json:"resource"`        // zone, record, user, token
	ResourceID *uint    `json:"resource_id"`
	Details   string    `gorm:"size:1024" json:"details"` // JSON details
	IP        string    `gorm:"size:45" json:"ip"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}
