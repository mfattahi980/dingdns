package models

import "time"

// FirewallRule represents a managed iptables rule
type FirewallRule struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Chain     string    `gorm:"size:20;not null" json:"chain"`    // INPUT, OUTPUT, FORWARD
	Action    string    `gorm:"size:20;not null" json:"action"`   // ACCEPT, DROP, REJECT
	Protocol  string    `gorm:"size:10" json:"protocol"`          // tcp, udp, icmp, all
	SrcIP     string    `gorm:"size:100" json:"src_ip"`           // source IP/CIDR
	DstIP     string    `gorm:"size:100" json:"dst_ip"`           // destination IP/CIDR
	DstPort   string    `gorm:"size:50" json:"dst_port"`          // port or range e.g. 80 or 8000:9000
	Comment   string    `gorm:"size:200" json:"comment"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}
