package dns

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dingdns/dingdns/internal/core"
	dnscore "github.com/dingdns/dingdns/internal/dns"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

// ── SSL Job system ────────────────────────────────────────────────────────────

type sslJob struct {
	Lines  []string `json:"lines"`
	Done   bool     `json:"done"`
	HasErr bool     `json:"error"`
	mu     sync.Mutex
}

var sslJobs sync.Map

func newSSLJobID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (j *sslJob) add(line string) {
	j.mu.Lock()
	j.Lines = append(j.Lines, line)
	j.mu.Unlock()
}

func (j *sslJob) finish(errMsg string) {
	j.mu.Lock()
	if errMsg != "" {
		j.Lines = append(j.Lines, "❌ "+errMsg)
		j.HasErr = true
	} else {
		j.Lines = append(j.Lines, "✅ Certificate issued successfully!")
	}
	j.Done = true
	j.mu.Unlock()
}

// TestDNS tests whether a domain's DNS is correctly pointing to the server
func TestDNS(c *gin.Context) {
	domain := c.Query("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain parameter required"})
		return
	}
	domain = strings.ToLower(strings.TrimSpace(domain))

	result := map[string]interface{}{
		"domain":    domain,
		"tested_at": time.Now().Format(time.RFC3339),
	}

	// 1. Get server's public IP
	serverIP := getServerPublicIP()
	result["server_ip"] = serverIP

	// 2. Resolve domain using Google DNS (8.8.8.8) for external view
	resolvedIPs := resolveWithDNS(domain, "8.8.8.8:53")
	result["resolved_ips"] = resolvedIPs

	// 3. Also resolve using Cloudflare DNS (1.1.1.1) for second opinion
	resolvedCF := resolveWithDNS(domain, "1.1.1.1:53")
	result["resolved_ips_cf"] = resolvedCF

	// 4. Check NS records
	nsRecords := getNSRecords(domain, "8.8.8.8:53")
	result["ns_records"] = nsRecords

	// 5. Check if server domain is in NS records
	serverDomain := core.GetSetting("server_domain")
	if serverDomain == "" {
		serverDomain = getServerPublicIP()
	}
	nsPointsToUs := false
	for _, ns := range nsRecords {
		if strings.Contains(strings.ToLower(ns), strings.ToLower(serverDomain)) {
			nsPointsToUs = true
			break
		}
	}
	result["ns_points_to_us"] = nsPointsToUs
	result["server_domain"] = serverDomain

	// 6. Check A record match
	aMatches := false
	for _, ip := range resolvedIPs {
		if ip == serverIP {
			aMatches = true
			break
		}
	}
	result["a_record_matches"] = aMatches

	// 7. Check if zone exists in our DB
	var zone models.Zone
	zoneExists := models.DB.Where("name = ? AND is_active = ?", domain, true).First(&zone).Error == nil
	result["zone_in_db"] = zoneExists
	if zoneExists {
		result["zone_id"] = zone.ID
	}

	// 8. Overall status
	status := "ok"
	issues := []string{}

	if len(resolvedIPs) == 0 {
		status = "error"
		issues = append(issues, "Domain does not resolve (no A record found)")
	} else if !aMatches && serverIP != "" {
		status = "warning"
		issues = append(issues, fmt.Sprintf("A record points to %v, not server IP (%s)", resolvedIPs, serverIP))
	}

	if len(nsRecords) == 0 {
		issues = append(issues, "No NS records found")
		if status == "ok" {
			status = "warning"
		}
	} else if !nsPointsToUs {
		issues = append(issues, "NS records do not point to this server")
		if status == "ok" {
			status = "warning"
		}
	}

	if !zoneExists {
		issues = append(issues, "Zone not configured in DingDns")
	}

	result["status"] = status
	result["issues"] = issues

	c.JSON(http.StatusOK, result)
}

// resolveWithDNS resolves a domain using a specific DNS server
func resolveWithDNS(domain, dnsServer string) []string {
	r := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, "udp", dnsServer)
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	addrs, err := r.LookupHost(ctx, domain)
	if err != nil {
		return []string{}
	}
	return addrs
}

// getNSRecords returns NS records for a domain
func getNSRecords(domain, dnsServer string) []string {
	r := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, "udp", dnsServer)
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	nss, err := r.LookupNS(ctx, domain)
	if err != nil {
		return []string{}
	}

	result := make([]string, 0, len(nss))
	for _, ns := range nss {
		result = append(result, strings.TrimSuffix(ns.Host, "."))
	}
	return result
}

// getServerPublicIP returns server's public IP
func getServerPublicIP() string {
	// Try setting first
	if ip := core.GetSetting("server_ip"); ip != "" {
		return ip
	}

	// Try external service
	clients := []string{
		"https://api.ipify.org",
		"https://ifconfig.me/ip",
		"https://icanhazip.com",
	}

	for _, url := range clients {
		client := &http.Client{Timeout: 3 * time.Second}
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			continue
		}
		ip := strings.TrimSpace(string(body))
		if net.ParseIP(ip) != nil {
			return ip
		}
	}

	// Fallback: local IP
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return ""
}

// GetServerInfo returns server identity info
func GetServerInfo(c *gin.Context) {
	serverIP := getServerPublicIP()
	serverDomain := core.GetSetting("server_domain")
	apiDomain := core.GetSetting("api_domain")
	ns1 := core.GetSetting("ns1_hostname")
	ns2 := core.GetSetting("ns2_hostname")
	baseURL := core.GetSetting("base_url")

	if ns1 == "" && serverDomain != "" {
		ns1 = "ns1." + serverDomain
	}
	if ns2 == "" && serverDomain != "" {
		ns2 = "ns2." + serverDomain
	}

	// Build effective API base URL for DDNS
	apiBase := ""
	if apiDomain != "" {
		apiBase = "https://" + apiDomain
	} else if baseURL != "" {
		apiBase = strings.TrimRight(baseURL, "/")
	} else if serverIP != "" {
		apiBase = "http://" + serverIP + ":8080"
	}

	c.JSON(http.StatusOK, gin.H{
		"server_ip":     serverIP,
		"server_domain": serverDomain,
		"api_domain":    apiDomain,
		"api_base_url":  apiBase,
		"ns1_hostname":  ns1,
		"ns2_hostname":  ns2,
	})
}

// DetectServerIP auto-detects and saves the server's public IP
func DetectServerIP(c *gin.Context) {
	ip := getServerPublicIP()
	if ip == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not detect public IP"})
		return
	}
	core.SetSetting("server_ip", ip)
	c.JSON(http.StatusOK, gin.H{"ip": ip, "message": "Server IP saved"})
}

// CheckSSLStatus checks SSL certificate status for server_domain and api_domain
func CheckSSLStatus(c *gin.Context) {
	apiDomain := core.GetSetting("api_domain")

	if apiDomain == "" {
		c.JSON(http.StatusOK, gin.H{"status": "not_configured", "message": "Set API domain first"})
		return
	}

	resp := gin.H{
		"api": getDomainSSLInfo(apiDomain),
	}
	c.JSON(http.StatusOK, resp)
}

// getDomainSSLInfo returns SSL cert status for a single domain
func getDomainSSLInfo(domain string) map[string]interface{} {
	certPath := fmt.Sprintf("/opt/dingdns/ssl/certbot/live/%s/fullchain.pem", domain)
	keyPath := fmt.Sprintf("/opt/dingdns/ssl/certbot/live/%s/privkey.pem", domain)
	certInfo := getCertInfo(certPath)

	result := map[string]interface{}{
		"domain":      domain,
		"cert_path":   certPath,
		"key_path":    keyPath,
		"cert_exists": certInfo != nil,
	}
	if certInfo != nil {
		result["expires_at"] = certInfo["expires_at"]
		result["issuer"] = certInfo["issuer"]
		result["days_remaining"] = certInfo["days_remaining"]
		daysLeft, _ := certInfo["days_remaining"].(int)
		if daysLeft < 0 {
			result["status"] = "expired"
		} else if daysLeft < 30 {
			result["status"] = "expiring_soon"
		} else {
			result["status"] = "valid"
		}
	} else {
		result["status"] = "not_issued"
	}
	return result
}

// IssueSSLCert starts certbot in background and returns a job_id for polling
func IssueSSLCert(c *gin.Context) {
	var req struct {
		Domain string `json:"domain"`
	}
	c.ShouldBindJSON(&req)

	domain := strings.TrimSpace(req.Domain)
	if domain == "" {
		domain = core.GetSetting("api_domain")
	}
	if domain == "" {
		domain = core.GetSetting("server_domain")
	}
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain not specified"})
		return
	}

	email := core.GetSetting("smtp_from")
	if email == "" {
		if sd := core.GetSetting("server_domain"); sd != "" {
			email = "admin@" + strings.ToLower(sd)
		} else {
			email = "admin@" + strings.ToLower(domain)
		}
	}

	jobID := newSSLJobID()
	job := &sslJob{}
	sslJobs.Store(jobID, job)

	go func() {
		// Auto-clean job after 10 minutes
		defer func() {
			time.Sleep(10 * time.Minute)
			sslJobs.Delete(jobID)
		}()

		job.add(fmt.Sprintf("🔐 Issuing SSL certificate for: %s", domain))
		job.add(fmt.Sprintf("📧 Contact email: %s", email))
		job.add("⏳ Starting certbot (this may take 30–60 seconds)...")
		job.add("")

		cmd := exec.Command("certbot", "certonly",
			"--standalone",
			"--non-interactive",
			"--agree-tos",
			"--email", email,
			"-d", domain,
			"--http-01-port", "80",
			"--config-dir", "/opt/dingdns/ssl/certbot",
			"--work-dir", "/opt/dingdns/ssl/certbot/work",
			"--logs-dir", "/opt/dingdns/ssl/certbot/logs",
		)

		stdout, _ := cmd.StdoutPipe()
		stderr, _ := cmd.StderrPipe()

		if err := cmd.Start(); err != nil {
			job.finish("Failed to start certbot: " + err.Error())
			return
		}

		// Stream stdout and stderr concurrently
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			s := bufio.NewScanner(stdout)
			for s.Scan() {
				job.add(s.Text())
			}
		}()
		go func() {
			defer wg.Done()
			s := bufio.NewScanner(stderr)
			for s.Scan() {
				job.add(s.Text())
			}
		}()
		wg.Wait()

		err := cmd.Wait()
		if err != nil {
			job.finish(fmt.Sprintf("certbot exited with error: %v", err))
			return
		}

		// Certbot succeeded — wire the new certificate into config.json
		// and restart the service so HTTPS actually starts listening on :443.
		// Without this step the user has to manually edit config.json and
		// systemctl restart, which defeats the point of a one-click button.
		if applyErr := applySSLConfig(domain, job); applyErr != nil {
			job.add(fmt.Sprintf("⚠️ Cert issued but auto-config failed: %v", applyErr))
			job.add("   Edit /opt/dingdns/config.json manually and restart dingdns.")
			job.finish("")
			return
		}

		job.finish("")
	}()

	c.JSON(http.StatusOK, gin.H{"job_id": jobID, "domain": domain})
}

// applySSLConfig rewrites /opt/dingdns/config.json to point at the certbot
// live paths and flips ssl_enabled to true, then asks systemd to restart
// dingdns so the new TLS listener comes up. The restart will SIGTERM the
// current process — that's OK, the job state and certbot output have
// already been delivered to the client through earlier polls.
func applySSLConfig(domain string, job *sslJob) error {
	const cfgPath = "/opt/dingdns/config.json"
	certPath := fmt.Sprintf("/opt/dingdns/ssl/certbot/live/%s/fullchain.pem", domain)
	keyPath := fmt.Sprintf("/opt/dingdns/ssl/certbot/live/%s/privkey.pem", domain)

	// Sanity: certbot really did write the live files
	if _, err := os.Stat(certPath); err != nil {
		return fmt.Errorf("expected cert at %s: %w", certPath, err)
	}
	if _, err := os.Stat(keyPath); err != nil {
		return fmt.Errorf("expected key at %s: %w", keyPath, err)
	}

	job.add("📝 Updating config.json with SSL paths...")

	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		return fmt.Errorf("read config: %w", err)
	}

	// Parse loosely so we don't lose any fields we don't know about.
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return fmt.Errorf("parse config: %w", err)
	}
	m["ssl_enabled"] = true
	m["ssl_cert"] = certPath
	m["ssl_key"] = keyPath

	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	if err := os.WriteFile(cfgPath, out, 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	job.add("✅ config.json updated (ssl_enabled=true, paths point at certbot live dir)")

	// Restart in a detached goroutine so we get a chance to finalize the
	// current HTTP response/job state before the process is killed.
	job.add("🔄 Restarting dingdns service to apply SSL...")
	go func() {
		time.Sleep(500 * time.Millisecond)
		cmd := exec.Command("sudo", "-n", "systemctl", "restart", "dingdns")
		if err := cmd.Run(); err != nil {
			log.Printf("auto-restart after SSL issue failed: %v", err)
		}
	}()

	return nil
}

// GetSSLJob returns the current status and output lines of a certbot job
func GetSSLJob(c *gin.Context) {
	jobID := c.Param("id")
	val, ok := sslJobs.Load(jobID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found or expired"})
		return
	}
	job := val.(*sslJob)
	job.mu.Lock()
	defer job.mu.Unlock()
	c.JSON(http.StatusOK, gin.H{
		"lines": job.Lines,
		"done":  job.Done,
		"error": job.HasErr,
	})
}

// ── Auto-renew loop ───────────────────────────────────────────────────────────

// StartAutoRenewLoop starts a background goroutine that checks the SSL cert
// every 12 hours and renews it when days_remaining <= ssl_renew_days_before.
func StartAutoRenewLoop() {
	go func() {
		// Wait a bit after startup before first check
		time.Sleep(2 * time.Minute)
		for {
			checkAndAutoRenew()
			time.Sleep(12 * time.Hour)
		}
	}()
	log.Println("SSL auto-renew loop started")
}

func checkAndAutoRenew() {
	if core.GetSetting("ssl_auto_renew") != "true" {
		return
	}
	apiDomain := core.GetSetting("api_domain")
	if apiDomain == "" {
		return
	}
	info := getDomainSSLInfo(apiDomain)
	if info["cert_exists"] != true {
		return
	}
	daysLeft, ok := info["days_remaining"].(int)
	if !ok {
		return
	}
	renewDays := 30
	if s := core.GetSetting("ssl_renew_days_before"); s != "" {
		if d, err := strconv.Atoi(s); err == nil && d > 0 {
			renewDays = d
		}
	}
	if daysLeft <= renewDays {
		log.Printf("SSL cert for %s expires in %d days (<= %d), auto-renewing...", apiDomain, daysLeft, renewDays)
		runAutoRenew()
	}
}

func runAutoRenew() {
	cmd := exec.Command("certbot", "renew", "--non-interactive", "--quiet",
		"--config-dir", "/opt/dingdns/ssl/certbot",
		"--work-dir", "/opt/dingdns/ssl/certbot/work",
		"--logs-dir", "/opt/dingdns/ssl/certbot/logs",
	)
	now := time.Now().Format(time.RFC3339)
	err := cmd.Run()
	core.SetSetting("ssl_last_renew_at", now)
	if err != nil {
		result := "failed: " + err.Error()
		core.SetSetting("ssl_last_renew_result", result)
		log.Printf("SSL auto-renew failed: %v", err)
	} else {
		core.SetSetting("ssl_last_renew_result", "success")
		log.Println("SSL auto-renew succeeded")
	}
}

// GetSSLAutoRenewStatus returns current auto-renew settings and last run info
func GetSSLAutoRenewStatus(c *gin.Context) {
	autoRenew := core.GetSetting("ssl_auto_renew") == "true"
	renewDays := core.GetSetting("ssl_renew_days_before")
	if renewDays == "" {
		renewDays = "30"
	}
	c.JSON(http.StatusOK, gin.H{
		"auto_renew":        autoRenew,
		"renew_days_before": renewDays,
		"last_renew_at":     core.GetSetting("ssl_last_renew_at"),
		"last_renew_result": core.GetSetting("ssl_last_renew_result"),
	})
}

// RenewSSLCert renews existing certificate
func RenewSSLCert(c *gin.Context) {
	cmd := exec.Command("certbot", "renew", "--non-interactive", "--quiet",
		"--config-dir", "/opt/dingdns/ssl/certbot",
		"--work-dir", "/opt/dingdns/ssl/certbot/work",
		"--logs-dir", "/opt/dingdns/ssl/certbot/logs",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  fmt.Sprintf("renewal failed: %v", err),
			"output": string(output),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Certificate renewed", "output": string(output)})
}

// GetCacheStatus returns current DNS cache statistics
func GetCacheStatus(c *gin.Context) {
	status := dnscore.CacheStatus()
	status["auto_reload"] = core.GetSetting("dns_auto_reload")
	if status["auto_reload"] == "" {
		status["auto_reload"] = "true"
	}
	status["reload_interval"] = core.GetSetting("dns_reload_interval")
	if status["reload_interval"] == "" {
		status["reload_interval"] = "30"
	}
	status["reload_debounce"] = core.GetSetting("dns_reload_debounce")
	if status["reload_debounce"] == "" {
		status["reload_debounce"] = "500"
	}
	c.JSON(http.StatusOK, status)
}

// ManualReload triggers an immediate DNS cache reload
func ManualReload(c *gin.Context) {
	dnscore.ForceReload()

	adminID := core.GetAdminID(c)
	var aidPtr *uint
	if adminID > 0 {
		aidPtr = &adminID
	}
	models.DB.Create(&models.AuditLog{
		UserID: aidPtr, Action: "dns_cache_reload", Resource: "dns",
		Details: "manual reload", IP: c.ClientIP(),
	})

	c.JSON(http.StatusOK, gin.H{"message": "DNS cache reload triggered"})
}

// getCertInfo reads certificate info using openssl
func getCertInfo(certPath string) map[string]interface{} {
	cmd := exec.Command("openssl", "x509", "-in", certPath, "-noout",
		"-enddate", "-issuer", "-subject")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	info := map[string]interface{}{}
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "notAfter=") {
			dateStr := strings.TrimPrefix(line, "notAfter=")
			t, err := time.Parse("Jan  2 15:04:05 2006 MST", strings.TrimSpace(dateStr))
			if err == nil {
				info["expires_at"] = t.Format(time.RFC3339)
				info["days_remaining"] = int(time.Until(t).Hours() / 24)
			}
		}
		if strings.HasPrefix(line, "issuer=") {
			info["issuer"] = strings.TrimPrefix(line, "issuer=")
		}
	}
	return info
}
