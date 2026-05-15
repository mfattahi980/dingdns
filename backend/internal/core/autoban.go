package core

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Auto-ban setting keys (also referenced by the settings module defaults).
const (
	SettingAutoBanEnabled        = "auto_ban_enabled"
	SettingAutoBanThreshold      = "auto_ban_threshold"
	SettingAutoBanWindowMinutes  = "auto_ban_window_minutes"
	SettingAutoBanDuration       = "auto_ban_duration"        // "1h" | "24h" | "permanent" | "progressive"
	SettingAutoBanFirewallMode   = "auto_ban_firewall_mode"   // "app_only" | "app_and_firewall" | "firewall_only"
	SettingAutoBanTrigBadAPIKey  = "auto_ban_trigger_bad_api_key"
	SettingAutoBanTrigBadOrigin  = "auto_ban_trigger_bad_origin"
	SettingAutoBanTrigBadIP      = "auto_ban_trigger_bad_ip"
	SettingAutoBanTrigRateLimit  = "auto_ban_trigger_rate_limit"
	SettingAutoBanTrigBadLogin   = "auto_ban_trigger_bad_login"
	SettingAutoBanTrigBadToken   = "auto_ban_trigger_bad_token"
	SettingAutoBanTrigBadPath    = "auto_ban_trigger_bad_path"
)

// Default values used when the setting is unset.
var autoBanDefaults = map[string]string{
	SettingAutoBanEnabled:       "true",
	SettingAutoBanThreshold:     "5",
	SettingAutoBanWindowMinutes: "10",
	SettingAutoBanDuration:      "1h",
	SettingAutoBanFirewallMode:  "app_only",
	SettingAutoBanTrigBadAPIKey: "true",
	SettingAutoBanTrigBadOrigin: "true",
	SettingAutoBanTrigBadIP:     "true",
	SettingAutoBanTrigRateLimit: "true",
	SettingAutoBanTrigBadLogin:  "true",
	SettingAutoBanTrigBadToken:  "true",
	SettingAutoBanTrigBadPath:   "false",
}

// AutoBanSetting returns the configured value or the default if unset/blank.
func AutoBanSetting(key string) string {
	v := strings.TrimSpace(GetSetting(key))
	if v == "" {
		if d, ok := autoBanDefaults[key]; ok {
			return d
		}
	}
	return v
}

// autoBanEnabled is the master switch.
func autoBanEnabled() bool {
	return AutoBanSetting(SettingAutoBanEnabled) == "true"
}

// triggerEnabled checks whether a specific event type can trigger auto-ban.
func triggerEnabled(eventType string) bool {
	switch eventType {
	case "bad_api_key":
		return AutoBanSetting(SettingAutoBanTrigBadAPIKey) == "true"
	case "bad_origin":
		return AutoBanSetting(SettingAutoBanTrigBadOrigin) == "true"
	case "bad_ip":
		return AutoBanSetting(SettingAutoBanTrigBadIP) == "true"
	case "rate_limit":
		return AutoBanSetting(SettingAutoBanTrigRateLimit) == "true"
	case "bad_login":
		return AutoBanSetting(SettingAutoBanTrigBadLogin) == "true"
	case "bad_token":
		return AutoBanSetting(SettingAutoBanTrigBadToken) == "true"
	case "bad_path":
		return AutoBanSetting(SettingAutoBanTrigBadPath) == "true"
	}
	return false
}

// parseAutoBanThreshold parses the threshold (events count) — falls back to 5.
func parseAutoBanThreshold() int {
	n, err := parseIntSafe(AutoBanSetting(SettingAutoBanThreshold))
	if err != nil || n <= 0 {
		return 5
	}
	return n
}

// parseAutoBanWindow parses the window in minutes — falls back to 10.
func parseAutoBanWindow() time.Duration {
	n, err := parseIntSafe(AutoBanSetting(SettingAutoBanWindowMinutes))
	if err != nil || n <= 0 {
		return 10 * time.Minute
	}
	return time.Duration(n) * time.Minute
}

// AutoBanDuration returns either a positive duration or nil for "permanent".
// Progressive mode bumps the duration based on prior ban history.
func computeAutoBanDuration(ip string) *time.Duration {
	mode := strings.ToLower(strings.TrimSpace(AutoBanSetting(SettingAutoBanDuration)))
	switch mode {
	case "permanent":
		return nil
	case "24h":
		d := 24 * time.Hour
		return &d
	case "progressive":
		// Look at how many bans this IP has already had.
		var priorBans int64
		DB.Table("ip_bans").Where("ip = ?", ip).Count(&priorBans)
		switch {
		case priorBans == 0:
			d := time.Hour
			return &d
		case priorBans == 1:
			d := 24 * time.Hour
			return &d
		default:
			return nil // permanent on 3rd offense
		}
	default: // "1h" or anything unknown
		d := time.Hour
		return &d
	}
}

// ----------------------------------------------------------------------------
// Suspicious-event recording + auto-ban evaluation
// ----------------------------------------------------------------------------

// recordSuspicious inserts a suspicious_events row.
func recordSuspicious(ip, eventType, method, path, ua, origin, details string, banned bool) {
	DB.Exec(`
		INSERT INTO suspicious_events
			(ip, event_type, method, path, user_agent, origin, details, banned, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, ip, eventType, method, path, ua, origin, details, banned, time.Now())
}

// banMu serializes the "check+insert ban" sequence for a single IP so we
// don't race ourselves and create two bans for the same IP.
var banMu sync.Mutex

// RecordSuspiciousEvent logs the event and (if it crosses the threshold)
// auto-bans the IP. Safe to call from middlewares — never returns an error.
func RecordSuspiciousEvent(c *gin.Context, eventType, details string) {
	if c == nil {
		return
	}
	ip := GetRealIP(c)
	if ip == "" {
		return
	}
	ua := c.GetHeader("User-Agent")
	origin := c.GetHeader("Origin")
	method := c.Request.Method
	path := c.Request.URL.Path

	go func() {
		// 1. Always log the event itself (so operators can review).
		recordSuspicious(ip, eventType, method, path, ua, origin, details, false)

		// 2. If master switch off or this trigger disabled, stop here.
		if !autoBanEnabled() || !triggerEnabled(eventType) {
			return
		}

		banMu.Lock()
		defer banMu.Unlock()

		// 3. Is this IP already banned (and ban still valid)?  If yes, just
		//    bump hit counter on the existing ban.
		var existing struct {
			ID        uint
			ExpiresAt *time.Time
		}
		err := DB.Raw(`SELECT id, expires_at FROM ip_bans WHERE ip = ? LIMIT 1`, ip).Scan(&existing).Error
		if err == nil && existing.ID > 0 {
			active := existing.ExpiresAt == nil || existing.ExpiresAt.After(time.Now())
			if active {
				DB.Exec(`UPDATE ip_bans SET hits = hits + 1, last_hit = ?, last_path = ?, user_agent = ?, event_type = ? WHERE id = ?`,
					time.Now(), path, ua, eventType, existing.ID)
				// Mark the event as banned for visibility.
				DB.Exec(`UPDATE suspicious_events SET banned = 1 WHERE ip = ? AND created_at >= ?`,
					ip, time.Now().Add(-5*time.Second))
				return
			}
		}

		// 4. Count recent suspicious events from this IP.
		threshold := parseAutoBanThreshold()
		window := parseAutoBanWindow()
		since := time.Now().Add(-window)
		var count int64
		DB.Raw(`SELECT COUNT(*) FROM suspicious_events WHERE ip = ? AND created_at >= ?`, ip, since).Scan(&count)
		if int(count) < threshold {
			return
		}

		// 5. Build and insert the ban.
		duration := computeAutoBanDuration(ip)
		var expiresAt *time.Time
		if duration != nil {
			t := time.Now().Add(*duration)
			expiresAt = &t
		}
		reason := fmt.Sprintf("auto: %s (%d events in %s)", eventType, count, window)

		mode := strings.ToLower(strings.TrimSpace(AutoBanSetting(SettingAutoBanFirewallMode)))
		appBan := mode != "firewall_only"
		fwBan := mode == "app_and_firewall" || mode == "firewall_only"

		var firewallRuleID *uint
		if fwBan {
			if rid, ok := AddAutoFirewallRule(ip, reason); ok {
				firewallRuleID = &rid
			}
		}

		if appBan {
			res := DB.Exec(`
				INSERT INTO ip_bans
					(ip, reason, expires_at, created_at, is_auto, hits, last_hit, user_agent, last_path, event_type, firewall_rule)
				VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(ip) DO UPDATE SET
					reason = excluded.reason,
					expires_at = excluded.expires_at,
					is_auto = 1,
					hits = ip_bans.hits + 1,
					last_hit = excluded.last_hit,
					user_agent = excluded.user_agent,
					last_path = excluded.last_path,
					event_type = excluded.event_type,
					firewall_rule = COALESCE(excluded.firewall_rule, ip_bans.firewall_rule)
			`, ip, reason, expiresAt, time.Now(), count, time.Now(), ua, path, eventType, firewallRuleID)
			if res.Error != nil {
				return
			}
		}

		// Mark recent events from this IP as "banned" so the UI can highlight them.
		DB.Exec(`UPDATE suspicious_events SET banned = 1 WHERE ip = ? AND created_at >= ?`, ip, since)

		// 6. Audit log so admins can trace where this came from.
		DB.Exec(`INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip, created_at) VALUES (NULL, ?, ?, NULL, ?, ?, ?)`,
			"auto_ban_ip", "ip_ban", "ip="+ip+" "+reason, ip, time.Now())
	}()
}

// ----------------------------------------------------------------------------
// Firewall hook — implemented by the security package via this registration
// pattern (to avoid an import cycle: core <- security).
// ----------------------------------------------------------------------------

// firewallRuleAdder is the signature for adding an iptables/ufw DROP rule.
// It returns the FirewallRule DB id and a success flag.
type firewallRuleAdder func(ip, reason string) (uint, bool)
type firewallRuleRemover func(ruleID uint) bool

var (
	fwAdderMu   sync.RWMutex
	fwAdder     firewallRuleAdder
	fwRemover   firewallRuleRemover
)

// RegisterFirewallHooks lets the security package wire its real implementations.
func RegisterFirewallHooks(add firewallRuleAdder, remove firewallRuleRemover) {
	fwAdderMu.Lock()
	defer fwAdderMu.Unlock()
	fwAdder = add
	fwRemover = remove
}

// AddAutoFirewallRule calls the registered adder (no-op if unregistered).
func AddAutoFirewallRule(ip, reason string) (uint, bool) {
	fwAdderMu.RLock()
	add := fwAdder
	fwAdderMu.RUnlock()
	if add == nil {
		return 0, false
	}
	return add(ip, reason)
}

// RemoveAutoFirewallRule calls the registered remover (no-op if unregistered).
func RemoveAutoFirewallRule(ruleID uint) bool {
	fwAdderMu.RLock()
	rem := fwRemover
	fwAdderMu.RUnlock()
	if rem == nil {
		return false
	}
	return rem(ruleID)
}
