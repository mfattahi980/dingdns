package models

import (
	"time"

	"gorm.io/gorm"
)

// Zone represents a DNS zone (e.g., example.com)
type Zone struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"uniqueIndex;size:255;not null" json:"name"` // e.g., example.com
	ZoneType  string         `gorm:"size:20;not null;default:subdomain" json:"zone_type"` // subdomain or custom
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	SOASerial uint32         `gorm:"default:1" json:"soa_serial"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Records []Record `gorm:"foreignKey:ZoneID" json:"records,omitempty"`
}

// IncrementSerial increases the SOA serial number
func (z *Zone) IncrementSerial() {
	today := time.Now().Format("20060102")
	todaySerial := parseUint32(today) * 100

	if z.SOASerial < todaySerial {
		z.SOASerial = todaySerial + 1
	} else {
		z.SOASerial++
	}
}

func parseUint32(s string) uint32 {
	var n uint32
	for _, c := range s {
		n = n*10 + uint32(c-'0')
	}
	return n
}
