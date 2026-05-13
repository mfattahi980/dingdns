package ddns

import (
	"fmt"
	"log"
	"net"
	"time"

	"github.com/dingdns/dingdns/internal/models"
)

// UpdateResult holds the result of a DDNS update
type UpdateResult struct {
	Success    bool   `json:"success"`
	OldIP      string `json:"old_ip,omitempty"`
	NewIP      string `json:"new_ip"`
	RecordName string `json:"record_name"`
	ZoneName   string `json:"zone_name"`
	Changed    bool   `json:"changed"`
}

// UpdateByToken updates a DNS record using a DDNS token
func UpdateByToken(token string, newIP string) (*UpdateResult, error) {
	ip := net.ParseIP(newIP)
	if ip == nil {
		return nil, fmt.Errorf("invalid IP address: %s", newIP)
	}

	var ddnsToken models.DDNSToken
	err := models.DB.Where("token = ? AND is_active = ?", token, true).First(&ddnsToken).Error
	if err != nil {
		return nil, fmt.Errorf("invalid or inactive token")
	}

	var record models.Record
	err = models.DB.First(&record, ddnsToken.RecordID).Error
	if err != nil {
		return nil, fmt.Errorf("record not found")
	}

	var zone models.Zone
	err = models.DB.First(&zone, record.ZoneID).Error
	if err != nil {
		return nil, fmt.Errorf("zone not found")
	}

	result := &UpdateResult{
		Success:    true,
		OldIP:      record.Content,
		NewIP:      newIP,
		RecordName: record.Name,
		ZoneName:   zone.Name,
		Changed:    record.Content != newIP,
	}

	if record.Content != newIP {
		recordType := "A"
		if ip.To4() == nil {
			recordType = "AAAA"
		}

		models.DB.Model(&record).Updates(map[string]interface{}{
			"content": newIP,
			"type":    recordType,
		})

		zone.IncrementSerial()
		models.DB.Save(&zone)

		log.Printf("[DDNS] Updated %s.%s: %s -> %s", record.Name, zone.Name, result.OldIP, newIP)
	}

	now := time.Now()
	models.DB.Model(&ddnsToken).Updates(map[string]interface{}{
		"last_used": &now,
		"last_ip":   newIP,
	})

	return result, nil
}
