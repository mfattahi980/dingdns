package dns

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/dingdns/dingdns/internal/config"
	"github.com/dingdns/dingdns/internal/models"
	mdns "github.com/miekg/dns"
)


// Server represents the DNS server
type Server struct {
	config       *config.Config
	udpServer    *mdns.Server
	tcpServer    *mdns.Server
	cache        *RecordCache
	reloadSignal chan struct{} // debounce channel
}

// globalServer holds the running DNS server instance for cross-package reload
var globalServer *Server

// SetGlobalServer registers the active DNS server so TriggerReload can reach it
func SetGlobalServer(s *Server) {
	globalServer = s
}

// TriggerReload schedules a debounced DNS cache reload.
// Respects dns_auto_reload and dns_reload_debounce settings.
func TriggerReload() {
	if globalServer == nil {
		return
	}
	globalServer.scheduledReload()
}

// ForceReload does an immediate reload regardless of settings (used by manual reload API).
func ForceReload() {
	if globalServer != nil {
		go globalServer.ReloadCache()
	}
}

// CacheStatus returns current cache statistics.
func CacheStatus() map[string]interface{} {
	if globalServer == nil {
		return map[string]interface{}{"status": "not_started"}
	}
	globalServer.cache.mu.RLock()
	defer globalServer.cache.mu.RUnlock()
	return map[string]interface{}{
		"zones":        len(globalServer.cache.zones),
		"record_keys":  len(globalServer.cache.records),
		"last_reload":  globalServer.cache.lastLoad.Format(time.RFC3339),
		"interval_sec": int(globalServer.cache.ttl.Seconds()),
	}
}

// RecordCache caches DNS records in memory for fast lookups
type RecordCache struct {
	mu      sync.RWMutex
	records map[string][]models.Record // key: "zone:name:type"
	zones   map[string]models.Zone     // key: zone name
	ttl     time.Duration
	lastLoad time.Time
}

// NewServer creates a new DNS server
func NewServer(cfg *config.Config) *Server {
	s := &Server{
		config: cfg,
		cache: &RecordCache{
			records: make(map[string][]models.Record),
			zones:   make(map[string]models.Zone),
			ttl:     30 * time.Second,
		},
		reloadSignal: make(chan struct{}, 1),
	}
	return s
}

// scheduledReload sends a debounced reload signal if auto_reload is enabled.
func (s *Server) scheduledReload() {
	// Check if auto-reload is enabled (default true)
	autoReload := getSettingStr("dns_auto_reload", "true")
	if autoReload != "true" {
		return
	}
	// Non-blocking send — if channel already has a pending signal, skip
	select {
	case s.reloadSignal <- struct{}{}:
	default:
	}
}

// getSettingStr reads a setting from DB with a fallback default.
// Avoids import cycle by using models.DB directly.
func getSettingStr(key, def string) string {
	var s models.Setting
	if err := models.DB.Where("key = ?", key).First(&s).Error; err != nil {
		return def
	}
	if s.Value == "" {
		return def
	}
	return s.Value
}

// getSettingInt reads an integer setting with fallback.
func getSettingInt(key string, def int) int {
	v := getSettingStr(key, "")
	if v == "" {
		return def
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil || n <= 0 {
		return def
	}
	return n
}

// Start launches both UDP and TCP DNS servers
func (s *Server) Start() error {
	// Load initial records into cache
	s.ReloadCache()

	// Start cache refresh goroutine
	go s.cacheRefreshLoop()

	handler := mdns.HandlerFunc(s.handleDNSRequest)

	addr := ":" + s.config.DNSPort

	s.udpServer = &mdns.Server{
		Addr:    addr,
		Net:     "udp",
		Handler: handler,
	}

	s.tcpServer = &mdns.Server{
		Addr:    addr,
		Net:     "tcp",
		Handler: handler,
	}

	errChan := make(chan error, 2)

	go func() {
		log.Printf("[DNS] UDP server starting on %s", addr)
		if err := s.udpServer.ListenAndServe(); err != nil {
			errChan <- fmt.Errorf("UDP server error: %w", err)
		}
	}()

	go func() {
		log.Printf("[DNS] TCP server starting on %s", addr)
		if err := s.tcpServer.ListenAndServe(); err != nil {
			errChan <- fmt.Errorf("TCP server error: %w", err)
		}
	}()

	// Wait a moment to check for immediate errors
	time.Sleep(100 * time.Millisecond)

	select {
	case err := <-errChan:
		return err
	default:
		log.Printf("[DNS] Server started successfully on port %s", s.config.DNSPort)
		return nil
	}
}

// Stop shuts down the DNS servers
func (s *Server) Stop() {
	if s.udpServer != nil {
		s.udpServer.Shutdown()
	}
	if s.tcpServer != nil {
		s.tcpServer.Shutdown()
	}
}

// ReloadCache refreshes the in-memory record cache from the database
func (s *Server) ReloadCache() {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	// Load all active zones
	var zones []models.Zone
	models.DB.Where("is_active = ?", true).Find(&zones)

	s.cache.zones = make(map[string]models.Zone)
	for _, z := range zones {
		s.cache.zones[mdns.Fqdn(z.Name)] = z
	}

	// Load all records for active zones
	s.cache.records = make(map[string][]models.Record)
	var records []models.Record
	models.DB.Joins("JOIN zones ON zones.id = records.zone_id").
		Where("zones.is_active = ? AND zones.deleted_at IS NULL AND records.deleted_at IS NULL", true).
		Find(&records)

	for _, r := range records {
		// Find zone name for this record
		var zoneName string
		for _, z := range zones {
			if z.ID == r.ZoneID {
				zoneName = z.Name
				break
			}
		}
		if zoneName == "" {
			continue
		}

		key := cacheKey(zoneName, r.Name, r.Type)
		s.cache.records[key] = append(s.cache.records[key], r)
	}

	s.cache.lastLoad = time.Now()
	log.Printf("[DNS] Cache reloaded: %d zones, %d record entries", len(s.cache.zones), len(records))
}

func (s *Server) cacheRefreshLoop() {
	// Start with default ticker; we'll reset it when interval setting changes
	intervalSec := getSettingInt("dns_reload_interval", 30)
	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	// Ticker to re-read interval setting every minute
	intervalCheck := time.NewTicker(60 * time.Second)
	defer intervalCheck.Stop()

	for {
		select {
		case <-ticker.C:
			// Periodic reload
			s.ReloadCache()

		case <-s.reloadSignal:
			// Debounced auto-reload: wait for debounce window, drain extras
			debounceMs := getSettingInt("dns_reload_debounce", 500)
			debounce := time.NewTimer(time.Duration(debounceMs) * time.Millisecond)
			draining := true
			for draining {
				select {
				case <-s.reloadSignal: // absorb more signals during debounce
				case <-debounce.C:
					draining = false
				}
			}
			s.ReloadCache()

		case <-intervalCheck.C:
			// Re-read interval from settings in case it changed
			newInterval := getSettingInt("dns_reload_interval", 30)
			current := int(s.cache.ttl.Seconds())
			if newInterval != current {
				s.cache.mu.Lock()
				s.cache.ttl = time.Duration(newInterval) * time.Second
				s.cache.mu.Unlock()
				ticker.Reset(time.Duration(newInterval) * time.Second)
				log.Printf("[DNS] Reload interval updated: %ds", newInterval)
			}
		}
	}
}

// handleDNSRequest processes incoming DNS queries
func (s *Server) handleDNSRequest(w mdns.ResponseWriter, r *mdns.Msg) {
	msg := new(mdns.Msg)
	msg.SetReply(r)
	msg.Authoritative = true
	msg.Compress = true

	for _, q := range r.Question {
		answers := s.resolve(q)
		msg.Answer = append(msg.Answer, answers...)
	}

	// If no answers found, set NXDOMAIN
	if len(msg.Answer) == 0 {
		msg.Rcode = mdns.RcodeNameError

		// Add SOA to authority section for proper NXDOMAIN
		for _, q := range r.Question {
			if soa := s.getSOA(q.Name); soa != nil {
				msg.Ns = append(msg.Ns, soa)
			}
		}
	}

	w.WriteMsg(msg)
}

// resolve finds DNS records for a query
func (s *Server) resolve(q mdns.Question) []mdns.RR {
	s.cache.mu.RLock()
	defer s.cache.mu.RUnlock()

	qName := strings.ToLower(q.Name)
	qType := mdns.TypeToString[q.Qtype]

	// Find which zone this belongs to
	zoneName := s.findZone(qName)
	if zoneName == "" {
		return nil
	}

	// Determine the record name relative to zone
	recordName := s.getRecordName(qName, zoneName)

	// Look up in cache
	key := cacheKey(strings.TrimSuffix(zoneName, "."), recordName, qType)
	records := s.cache.records[key]

	// If asking for A/AAAA and we have a CNAME, return that
	if len(records) == 0 && (qType == "A" || qType == "AAAA") {
		cnameKey := cacheKey(strings.TrimSuffix(zoneName, "."), recordName, "CNAME")
		records = s.cache.records[cnameKey]
	}

	var answers []mdns.RR
	for _, rec := range records {
		rr := s.recordToRR(qName, rec)
		if rr != nil {
			answers = append(answers, rr)
		}
	}

	return answers
}

// findZone finds the zone that matches a query name
func (s *Server) findZone(qName string) string {
	name := strings.ToLower(qName)

	// Try progressively shorter names
	for {
		if _, ok := s.cache.zones[name]; ok {
			return name
		}

		// Remove first label
		idx := strings.Index(name, ".")
		if idx == -1 || idx == len(name)-1 {
			return ""
		}
		name = name[idx+1:]
	}
}

// getRecordName extracts the record name from a FQDN relative to the zone
func (s *Server) getRecordName(qName, zoneName string) string {
	qName = strings.ToLower(qName)
	zoneName = strings.ToLower(zoneName)

	if qName == zoneName {
		return "@"
	}

	// Remove zone suffix to get relative name
	relative := strings.TrimSuffix(qName, "."+zoneName)
	relative = strings.TrimSuffix(relative, ".")
	if relative == "" {
		return "@"
	}
	return relative
}

// recordToRR converts a database record to a DNS resource record
func (s *Server) recordToRR(name string, rec models.Record) mdns.RR {
	ttl := rec.TTL
	if ttl == 0 {
		ttl = s.config.DefaultTTL
	}

	header := mdns.RR_Header{
		Name:   name,
		Rrtype: mdns.StringToType[rec.Type],
		Class:  mdns.ClassINET,
		Ttl:    ttl,
	}

	switch rec.Type {
	case "A":
		return &mdns.A{
			Hdr: header,
			A:   parseIP(rec.Content),
		}
	case "AAAA":
		return &mdns.AAAA{
			Hdr:  header,
			AAAA: parseIP(rec.Content),
		}
	case "CNAME":
		return &mdns.CNAME{
			Hdr:    header,
			Target: mdns.Fqdn(rec.Content),
		}
	case "MX":
		return &mdns.MX{
			Hdr:        header,
			Preference: rec.Priority,
			Mx:         mdns.Fqdn(rec.Content),
		}
	case "TXT":
		return &mdns.TXT{
			Hdr: header,
			Txt: []string{rec.Content},
		}
	case "NS":
		return &mdns.NS{
			Hdr: header,
			Ns:  mdns.Fqdn(rec.Content),
		}
	case "SRV":
		return parseSRV(header, rec)
	case "CAA":
		return parseCAA(header, rec)
	case "PTR":
		return &mdns.PTR{
			Hdr: header,
			Ptr: mdns.Fqdn(rec.Content),
		}
	}

	return nil
}

// getSOA returns a SOA record for a zone
func (s *Server) getSOA(qName string) mdns.RR {
	zoneName := s.findZone(strings.ToLower(qName))
	if zoneName == "" {
		return nil
	}

	zone, ok := s.cache.zones[zoneName]
	if !ok {
		return nil
	}

	return &mdns.SOA{
		Hdr: mdns.RR_Header{
			Name:   zoneName,
			Rrtype: mdns.TypeSOA,
			Class:  mdns.ClassINET,
			Ttl:    s.config.DefaultTTL,
		},
		Ns:      mdns.Fqdn(s.config.NSPrimary),
		Mbox:    dnsEmailFormat(s.config.AdminEmail),
		Serial:  zone.SOASerial,
		Refresh: 3600,
		Retry:   900,
		Expire:  604800,
		Minttl:  86400,
	}
}

func cacheKey(zone, name, recordType string) string {
	return strings.ToLower(zone + ":" + name + ":" + recordType)
}

// dnsEmailFormat converts email@example.com to email.example.com.
func dnsEmailFormat(email string) string {
	at := strings.Index(email, "@")
	if at == -1 {
		return email
	}
	return strings.ReplaceAll(email[:at], ".", "\\.") + "." + email[at+1:] + "."
}
