package dns

import (
	"fmt"
	"net"
	"strconv"
	"strings"

	"github.com/dingdns/dingdns/internal/models"
	mdns "github.com/miekg/dns"
)

// parseIP parses an IP address string
func parseIP(s string) net.IP {
	return net.ParseIP(strings.TrimSpace(s))
}

// parseSRV parses SRV record content: "weight port target"
func parseSRV(header mdns.RR_Header, rec models.Record) *mdns.SRV {
	parts := strings.Fields(rec.Content)
	if len(parts) < 3 {
		return nil
	}

	weight, _ := strconv.ParseUint(parts[0], 10, 16)
	port, _ := strconv.ParseUint(parts[1], 10, 16)

	return &mdns.SRV{
		Hdr:      header,
		Priority: rec.Priority,
		Weight:   uint16(weight),
		Port:     uint16(port),
		Target:   mdns.Fqdn(parts[2]),
	}
}

// parseCAA parses CAA record content: "flag tag value"
func parseCAA(header mdns.RR_Header, rec models.Record) *mdns.CAA {
	parts := strings.SplitN(rec.Content, " ", 3)
	if len(parts) < 3 {
		return nil
	}

	flag, _ := strconv.ParseUint(parts[0], 10, 8)

	return &mdns.CAA{
		Hdr:   header,
		Flag:  uint8(flag),
		Tag:   parts[1],
		Value: strings.Trim(parts[2], "\""),
	}
}

// ValidateRecordContent validates record content based on type
func ValidateRecordContent(recordType, content string) error {
	switch recordType {
	case "A":
		ip := net.ParseIP(content)
		if ip == nil || ip.To4() == nil {
			return fmt.Errorf("invalid IPv4 address: %s", content)
		}
	case "AAAA":
		ip := net.ParseIP(content)
		if ip == nil || ip.To4() != nil {
			return fmt.Errorf("invalid IPv6 address: %s", content)
		}
	case "CNAME", "NS", "PTR":
		if len(content) == 0 {
			return fmt.Errorf("content cannot be empty")
		}
	case "MX":
		if len(content) == 0 {
			return fmt.Errorf("MX target cannot be empty")
		}
	case "TXT":
		if len(content) > 255 {
			return fmt.Errorf("TXT record too long (max 255 chars)")
		}
	case "SRV":
		parts := strings.Fields(content)
		if len(parts) < 3 {
			return fmt.Errorf("SRV format: weight port target")
		}
	case "CAA":
		parts := strings.SplitN(content, " ", 3)
		if len(parts) < 3 {
			return fmt.Errorf("CAA format: flag tag value")
		}
	default:
		return fmt.Errorf("unsupported record type: %s", recordType)
	}
	return nil
}
