package models

import (
	"time"

	"gorm.io/gorm"
)

// Record represents a DNS record within a zone
type Record struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	ZoneID    uint           `gorm:"index;not null" json:"zone_id"`
	Name      string         `gorm:"size:255;not null" json:"name"`     // e.g., "@", "www", "mail"
	Type      string         `gorm:"size:10;not null" json:"type"`      // A, AAAA, CNAME, MX, TXT, NS, SRV
	Content   string         `gorm:"size:1024;not null" json:"content"` // e.g., "192.168.1.1", "mail.example.com"
	TTL       uint32         `gorm:"default:300" json:"ttl"`
	Priority  uint16         `gorm:"default:0" json:"priority"` // For MX and SRV records
	IsDDNS    bool           `gorm:"default:false" json:"is_ddns"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Zone Zone `gorm:"foreignKey:ZoneID" json:"zone,omitempty"`
}

// Valid DNS record types
var ValidRecordTypes = []string{
	"A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR",
}

// IsValidType checks if the record type is supported
func IsValidType(recordType string) bool {
	for _, t := range ValidRecordTypes {
		if t == recordType {
			return true
		}
	}
	return false
}
