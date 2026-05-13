package models

import "time"

// IPBan is a global IP ban
type IPBan struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	IP        string     `gorm:"uniqueIndex;size:45;not null" json:"ip"`
	Reason    string     `gorm:"size:255" json:"reason"`
	ExpiresAt *time.Time `json:"expires_at"` // nil = permanent
	CreatedAt time.Time  `json:"created_at"`
}

// IsExpired checks if the ban has expired
func (b *IPBan) IsExpired() bool {
	if b.ExpiresAt == nil {
		return false
	}
	return time.Now().After(*b.ExpiresAt)
}

// LoginAttempt tracks failed login attempts
type LoginAttempt struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	IP        string    `gorm:"index;size:45;not null" json:"ip"`
	Username  string    `gorm:"index;size:100" json:"username"`
	Success   bool      `gorm:"default:false" json:"success"`
	UserAgent string    `gorm:"size:512" json:"user_agent"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}
