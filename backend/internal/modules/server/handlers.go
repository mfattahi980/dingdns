package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dingdns/dingdns/internal/core"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

var startTime = time.Now()

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

// runSudo runs a command with sudo if not running as root
func runSudo(bin string, args ...string) (string, error) {
	var cmd *exec.Cmd
	if os.Getuid() == 0 {
		cmd = exec.Command(bin, args...)
	} else {
		allArgs := append([]string{bin}, args...)
		cmd = exec.Command("sudo", allArgs...)
	}
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// watchedServices is the list of services we monitor
var watchedServices = []string{
	"dingdns", "nginx", "apache2", "sshd", "ssh",
	"mysql", "mariadb", "postgresql", "redis", "memcached",
	"docker", "fail2ban", "ufw",
}

// allowedServices maps service names allowed for start/stop/restart
var allowedServices = map[string]bool{
	"dingdns": true, "nginx": true, "apache2": true,
	"sshd": true, "ssh": true, "mysql": true, "mariadb": true,
	"postgresql": true, "redis": true, "fail2ban": true, "ufw": true,
}

// installableServices maps service names that the panel can install via
// /usr/local/sbin/dingdns-install-service.sh — kept narrow on purpose so
// the panel can't apt-get arbitrary packages.
var installableServices = map[string]bool{
	"ufw": true, "fail2ban": true, "nginx": true, "apache2": true,
	"redis": true,
}

// ──────────────────────────────────────────────
// Status
// ──────────────────────────────────────────────

func (h *Handler) GetStatus(c *gin.Context) {
	status := map[string]interface{}{
		"uptime":      time.Since(startTime).String(),
		"uptime_secs": int64(time.Since(startTime).Seconds()),
		"started_at":  startTime.Format(time.RFC3339),
		"go_version":  runtime.Version(),
		"os":          runtime.GOOS,
		"arch":        runtime.GOARCH,
		"goroutines":  runtime.NumGoroutine(),
		"num_cpu":     runtime.NumCPU(),
	}
	if hostname, err := os.Hostname(); err == nil {
		status["hostname"] = hostname
	}
	if runtime.GOOS == "linux" {
		status["cpu"] = getCPUUsage()
		status["memory"] = getMemoryUsage()
		status["disk"] = getDiskUsage()
		status["load"] = getLoadAverage()
	}
	c.JSON(http.StatusOK, status)
}

// ──────────────────────────────────────────────
// Services
// ──────────────────────────────────────────────

func (h *Handler) GetServices(c *gin.Context) {
	var services []map[string]interface{}
	// Synthetic "firewall" row first — gives users a single yes/no answer
	// without having to puzzle out "UFW is dead but I have iptables rules,
	// am I protected?".
	services = append(services, synthesizeFirewallStatus())
	for _, svc := range watchedServices {
		info := getServiceDetail(svc)
		if info != nil {
			services = append(services, info)
		}
	}
	c.JSON(http.StatusOK, gin.H{"services": services})
}

func (h *Handler) StartService(c *gin.Context) {
	name := c.Param("name")
	if !allowedServices[name] {
		c.JSON(http.StatusForbidden, gin.H{"error": "service not in allowed list"})
		return
	}
	out, err := runSudo("/usr/bin/systemctl", "start", name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed: %s", strings.TrimSpace(out))})
		return
	}
	logAction(c, "start_service", "service", nil, name)
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s started", name)})
}

func (h *Handler) StopService(c *gin.Context) {
	name := c.Param("name")
	if name == "dingdns" {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot stop the dingdns service from within itself"})
		return
	}
	if !allowedServices[name] {
		c.JSON(http.StatusForbidden, gin.H{"error": "service not in allowed list"})
		return
	}
	out, err := runSudo("/usr/bin/systemctl", "stop", name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed: %s", strings.TrimSpace(out))})
		return
	}
	logAction(c, "stop_service", "service", nil, name)
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s stopped", name)})
}

func (h *Handler) RestartService(c *gin.Context) {
	name := c.Param("name")
	if !allowedServices[name] {
		c.JSON(http.StatusForbidden, gin.H{"error": "service not in allowed list"})
		return
	}
	out, err := runSudo("/usr/bin/systemctl", "restart", name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed: %s", strings.TrimSpace(out))})
		return
	}
	logAction(c, "restart_service", "service", nil, name)
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s restarted", name)})
}

func (h *Handler) GetServiceLogs(c *gin.Context) {
	name := c.Param("name")
	if !allowedServices[name] {
		c.JSON(http.StatusForbidden, gin.H{"error": "service not in allowed list"})
		return
	}
	linesStr := c.DefaultQuery("lines", "200")
	lines, _ := strconv.Atoi(linesStr)
	if lines < 10 {
		lines = 10
	}
	if lines > 2000 {
		lines = 2000
	}

	out, err := runSudo("/usr/bin/journalctl", "-u", name, "-n", strconv.Itoa(lines), "--no-pager", "--output=short-iso")
	if err != nil {
		out = out + "\n[Error: " + err.Error() + "]\n[Tip: ensure journalctl sudoers rule is set]"
	}
	lineSlice := strings.Split(strings.TrimSpace(out), "\n")
	c.JSON(http.StatusOK, gin.H{
		"output":  out,
		"lines":   lineSlice,
		"service": name,
	})
}

// InstallService installs a not-yet-installed service via the
// /usr/local/sbin/dingdns-install-service.sh helper. The helper has a
// hardcoded package allowlist and is granted NOPASSWD sudo by
// installer/install.sh — keep the allowlist here in sync with the one
// inside the helper.
//
// This is intentionally synchronous: apt-get install of UFW / fail2ban /
// redis is fast (~10–30s), and a sync request gives the panel a clean
// success/error to surface without polling. If a future service has a
// much longer install we should switch to a job tracker like the update
// flow uses.
func (h *Handler) InstallService(c *gin.Context) {
	name := c.Param("name")
	if !installableServices[name] {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "service is not in the installable allowlist",
		})
		return
	}

	const helperPath = "/usr/local/sbin/dingdns-install-service.sh"
	if _, err := os.Stat(helperPath); os.IsNotExist(err) {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "install helper missing at " + helperPath +
				". Re-run installer/install.sh to install it (or use the Update Now button).",
		})
		return
	}

	cmd := exec.Command("sudo", "-n", helperPath, name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  fmt.Sprintf("install failed: %v", err),
			"output": string(out),
		})
		return
	}
	logAction(c, "install_service", "service", nil, name)
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("%s installed", name),
		"output":  string(out),
	})
}

// ──────────────────────────────────────────────
// Logs
// ──────────────────────────────────────────────

func (h *Handler) GetLogs(c *gin.Context) {
	linesStr := c.DefaultQuery("lines", "200")
	service := c.DefaultQuery("service", "dingdns")
	search := c.DefaultQuery("search", "")
	lines, _ := strconv.Atoi(linesStr)
	if lines < 10 {
		lines = 10
	}
	if lines > 2000 {
		lines = 2000
	}

	allowed := map[string]bool{
		"dingdns": true, "nginx": true, "sshd": true, "ssh": true, "system": true,
	}
	if !allowed[service] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service"})
		return
	}

	var out string
	var err error
	if service == "system" {
		out, err = runSudo("/usr/bin/journalctl", "-n", strconv.Itoa(lines), "--no-pager", "--output=short-iso")
	} else {
		out, err = runSudo("/usr/bin/journalctl", "-u", service, "-n", strconv.Itoa(lines), "--no-pager", "--output=short-iso")
	}
	if err != nil {
		out = out + "\n[Error: " + err.Error() + "]\n[Tip: run: echo \"dingdns ALL=(root) NOPASSWD: /usr/bin/journalctl\" > /etc/sudoers.d/dingdns-services]"
	}

	lineSlice := strings.Split(strings.TrimSpace(out), "\n")

	// Apply search filter
	if search != "" {
		var filtered []string
		lower := strings.ToLower(search)
		for _, l := range lineSlice {
			if strings.Contains(strings.ToLower(l), lower) {
				filtered = append(filtered, l)
			}
		}
		lineSlice = filtered
	}

	output := strings.Join(lineSlice, "\n")
	c.JSON(http.StatusOK, gin.H{
		"service": service,
		"output":  output,
		"lines":   lineSlice,
	})
}

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

func (h *Handler) GetConfig(c *gin.Context) {
	configPath := "/opt/dingdns/config.json"
	data, err := os.ReadFile(configPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read config: " + err.Error()})
		return
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid config JSON"})
		return
	}
	// Redact sensitive fields
	for _, key := range []string{"jwt_secret", "db_password", "smtp_password"} {
		if _, ok := cfg[key]; ok {
			cfg[key] = "***"
		}
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *Handler) UpdateConfig(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	configPath := "/opt/dingdns/config.json"
	data, err := os.ReadFile(configPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read config"})
		return
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid config JSON"})
		return
	}

	// Protected fields — never update via API
	protected := map[string]bool{
		"jwt_secret": true, "db_path": true, "db_password": true,
	}

	for k, v := range req {
		if !protected[k] {
			cfg[k] = v
		}
	}

	newData, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to marshal config"})
		return
	}
	if err := os.WriteFile(configPath, newData, 0640); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write config: " + err.Error()})
		return
	}

	logAction(c, "update_config", "server", nil, fmt.Sprintf("updated %d fields", len(req)))
	c.JSON(http.StatusOK, gin.H{"message": "Configuration saved. Restart service to apply changes."})
}

// ──────────────────────────────────────────────
// Backup & Restore
// ──────────────────────────────────────────────

const backupDir = "/opt/dingdns/backups"

type BackupInfo struct {
	Name      string    `json:"name"`
	SizeBytes int64     `json:"size_bytes"`
	SizeMB    string    `json:"size_mb"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *Handler) ListBackups(c *gin.Context) {
	os.MkdirAll(backupDir, 0750) //nolint
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"backups": []interface{}{}})
		return
	}
	var backups []BackupInfo
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if !strings.HasSuffix(e.Name(), ".db") {
			continue
		}
		info, _ := e.Info()
		backups = append(backups, BackupInfo{
			Name:      e.Name(),
			SizeBytes: info.Size(),
			SizeMB:    fmt.Sprintf("%.2f", float64(info.Size())/1024/1024),
			CreatedAt: info.ModTime(),
		})
	}
	if backups == nil {
		backups = []BackupInfo{}
	}
	c.JSON(http.StatusOK, gin.H{"backups": backups})
}

func (h *Handler) CreateBackup(c *gin.Context) {
	dbPath := "/opt/dingdns/data/dingdns.db"
	os.MkdirAll(backupDir, 0750) //nolint

	filename := fmt.Sprintf("dingdns-backup-%s.db", time.Now().Format("20060102-150405"))
	dest := filepath.Join(backupDir, filename)

	if err := copyFile(dbPath, dest); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create backup: " + err.Error()})
		return
	}

	stat, _ := os.Stat(dest)
	logAction(c, "create_backup", "server", nil, filename)
	c.JSON(http.StatusCreated, gin.H{
		"message":  "Backup created successfully",
		"filename": filename,
		"size_mb":  fmt.Sprintf("%.2f", float64(stat.Size())/1024/1024),
	})
}

// DownloadBackup creates a temp copy and streams it (legacy endpoint)
func (h *Handler) DownloadBackup(c *gin.Context) {
	dbPath := "/opt/dingdns/data/dingdns.db"
	tmpPath := dbPath + ".dl_tmp"

	if err := copyFile(dbPath, tmpPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create backup"})
		return
	}
	defer os.Remove(tmpPath)

	filename := fmt.Sprintf("dingdns-backup-%s.db", time.Now().Format("20060102-150405"))
	c.FileAttachment(tmpPath, filename)
}

func (h *Handler) DownloadBackupFile(c *gin.Context) {
	name := filepath.Base(c.Param("name"))
	if strings.Contains(name, "..") || !strings.HasSuffix(name, ".db") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}
	path := filepath.Join(backupDir, name)
	if _, err := os.Stat(path); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup not found"})
		return
	}
	c.FileAttachment(path, name)
}

func (h *Handler) DeleteBackupFile(c *gin.Context) {
	name := filepath.Base(c.Param("name"))
	if strings.Contains(name, "..") || !strings.HasSuffix(name, ".db") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}
	path := filepath.Join(backupDir, name)
	if err := os.Remove(path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete backup"})
		return
	}
	logAction(c, "delete_backup", "server", nil, name)
	c.JSON(http.StatusOK, gin.H{"message": "Backup deleted"})
}

func (h *Handler) RestoreBackup(c *gin.Context) {
	name := filepath.Base(c.Param("name"))
	if strings.Contains(name, "..") || !strings.HasSuffix(name, ".db") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
		return
	}
	path := filepath.Join(backupDir, name)
	if _, err := os.Stat(path); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup file not found"})
		return
	}

	// Validate SQLite magic bytes
	f, err := os.Open(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot open backup file"})
		return
	}
	magic := make([]byte, 16)
	f.Read(magic) //nolint
	f.Close()
	if string(magic) != "SQLite format 3\x00" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is not a valid SQLite database"})
		return
	}

	dbPath := "/opt/dingdns/data/dingdns.db"

	// Auto-backup before restore
	safeBackup := fmt.Sprintf("/opt/dingdns/data/pre-restore-%s.db", time.Now().Format("20060102-150405"))
	copyFile(dbPath, safeBackup) //nolint

	if err := copyFile(path, dbPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "restore failed: " + err.Error()})
		return
	}

	logAction(c, "restore_backup", "server", nil, name)
	c.JSON(http.StatusOK, gin.H{
		"message":       "Database restored successfully. Restart service to apply.",
		"safety_backup": safeBackup,
	})
}

// copyFile copies src to dst
func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()
	dstFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()
	_, err = io.Copy(dstFile, srcFile)
	return err
}

// ──────────────────────────────────────────────
// Database info & engine switching
// ──────────────────────────────────────────────

func (h *Handler) GetDatabaseInfo(c *gin.Context) {
	dbPath := "/opt/dingdns/data/dingdns.db"
	info := map[string]interface{}{
		"engine": "sqlite",
		"path":   dbPath,
	}
	if stat, err := os.Stat(dbPath); err == nil {
		info["size_bytes"] = stat.Size()
		info["size_mb"] = fmt.Sprintf("%.2f", float64(stat.Size())/1024/1024)
		info["modified_at"] = stat.ModTime().Format(time.RFC3339)
	}
	tables := map[string]int64{}
	for _, table := range []string{
		"zones", "records", "ddns_tokens", "api_keys", "ip_bans",
		"login_attempts", "audit_logs", "admins", "firewall_rules", "settings",
	} {
		var count int64
		models.DB.Table(table).Count(&count)
		tables[table] = count
	}
	info["tables"] = tables
	c.JSON(http.StatusOK, info)
}

var dbEngineList = []map[string]interface{}{
	{"id": "sqlite", "name": "SQLite", "description": "Default embedded database, no configuration needed", "package": "", "always_installed": true},
	{"id": "mysql", "name": "MySQL", "description": "Popular open-source relational database", "package": "mysql-server"},
	{"id": "mariadb", "name": "MariaDB", "description": "MySQL-compatible community fork", "package": "mariadb-server"},
	{"id": "postgresql", "name": "PostgreSQL", "description": "Advanced open-source relational database", "package": "postgresql"},
}

func (h *Handler) GetDBEngines(c *gin.Context) {
	result := make([]map[string]interface{}, len(dbEngineList))
	for i, e := range dbEngineList {
		entry := map[string]interface{}{}
		for k, v := range e {
			entry[k] = v
		}
		if alwaysInstalled, _ := e["always_installed"].(bool); alwaysInstalled {
			entry["installed"] = true
		} else if pkg, ok := e["package"].(string); ok && pkg != "" {
			binary := strings.Split(pkg, "-")[0]
			_, lookErr := exec.LookPath(binary)
			entry["installed"] = lookErr == nil
		}
		result[i] = entry
	}
	c.JSON(http.StatusOK, gin.H{"engines": result})
}

func (h *Handler) TestDBConnection(c *gin.Context) {
	var req struct {
		Engine   string `json:"engine"`
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Database string `json:"database"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.Engine == "sqlite" {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "SQLite is always available"})
		return
	}
	if req.Host == "" || req.Database == "" || req.Username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "host, database, and username are required"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Connection parameters accepted (live test coming in a future version)"})
}

func (h *Handler) StartDBMigration(c *gin.Context) {
	var req struct {
		Engine   string `json:"engine"`
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Database string `json:"database"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	jobID := fmt.Sprintf("mig-%d", time.Now().UnixNano())
	job := &MigrationJob{
		ID:        jobID,
		Status:    "running",
		Engine:    req.Engine,
		StartedAt: time.Now(),
	}
	migrationJobs.Store(jobID, job)

	go runMigrationJob(job, req.Engine, req.Host, req.Port, req.Database, req.Username, req.Password)

	logAction(c, "start_db_migration", "server", nil, req.Engine)
	c.JSON(http.StatusAccepted, gin.H{"job_id": jobID})
}

func (h *Handler) GetMigrationJob(c *gin.Context) {
	id := c.Param("id")
	v, ok := migrationJobs.Load(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}
	job := v.(*MigrationJob)
	c.JSON(http.StatusOK, gin.H{
		"id":         job.ID,
		"status":     job.Status,
		"engine":     job.Engine,
		"started_at": job.StartedAt,
		"output":     job.getOutput(),
	})
}

// ── Migration job ──

type MigrationJob struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"` // running | done | error
	Engine    string    `json:"engine"`
	StartedAt time.Time `json:"started_at"`
	mu        sync.Mutex
	lines     []string
}

var migrationJobs sync.Map

func (j *MigrationJob) write(line string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.lines = append(j.lines, line)
}

func (j *MigrationJob) getOutput() []string {
	j.mu.Lock()
	defer j.mu.Unlock()
	cp := make([]string, len(j.lines))
	copy(cp, j.lines)
	return cp
}

func runMigrationJob(job *MigrationJob, engine, host string, port int, db, user, pass string) {
	defer func() {
		if job.Status == "running" {
			job.Status = "done"
		}
	}()

	pkgMap := map[string]string{
		"mysql":      "mysql-server",
		"mariadb":    "mariadb-server",
		"postgresql": "postgresql",
	}

	if engine == "sqlite" {
		job.write("[INFO] Engine is already SQLite, nothing to migrate.")
		return
	}

	pkg, ok := pkgMap[engine]
	if !ok {
		job.write(fmt.Sprintf("[ERROR] Unknown engine: %s", engine))
		job.Status = "error"
		return
	}

	// Check / install engine package
	binary := strings.Split(pkg, "-")[0]
	job.write(fmt.Sprintf("[INFO] Checking if %s is installed...", binary))
	if _, err := exec.LookPath(binary); err != nil {
		job.write(fmt.Sprintf("[INFO] %s not found, installing via apt-get...", pkg))
		cmd := exec.Command("sudo", "apt-get", "install", "-y", pkg)
		pr, pw, _ := os.Pipe()
		cmd.Stdout = pw
		cmd.Stderr = pw
		if err := cmd.Start(); err != nil {
			job.write("[ERROR] failed to start apt-get: " + err.Error())
			job.Status = "error"
			return
		}
		buf := make([]byte, 512)
		for {
			n, readErr := pr.Read(buf)
			if n > 0 {
				for _, line := range strings.Split(string(buf[:n]), "\n") {
					line = strings.TrimSpace(line)
					if line != "" {
						job.write("[APT] " + line)
					}
				}
			}
			if readErr != nil {
				break
			}
		}
		pw.Close()
		if err := cmd.Wait(); err != nil {
			job.write("[ERROR] apt-get install failed: " + err.Error())
			job.Status = "error"
			return
		}
		job.write(fmt.Sprintf("[OK] %s installed successfully", pkg))
	} else {
		job.write(fmt.Sprintf("[OK] %s is already installed", binary))
	}

	// Export summary
	job.write("[INFO] Starting data export from SQLite...")
	tables := []string{
		"zones", "records", "ddns_tokens", "api_keys", "ip_bans",
		"login_attempts", "audit_logs", "admins", "firewall_rules", "settings",
	}
	total := int64(0)
	for _, t := range tables {
		var count int64
		models.DB.Table(t).Count(&count)
		total += count
		job.write(fmt.Sprintf("[INFO]   %-25s %d rows", t, count))
	}
	job.write(fmt.Sprintf("[INFO] Total: %d rows across %d tables", total, len(tables)))

	job.write("[INFO] ")
	job.write("[INFO] To complete the migration:")
	job.write(fmt.Sprintf("[INFO]   1. Set up a %s server and create database '%s'", engine, db))
	job.write(fmt.Sprintf("[INFO]   2. Update /opt/dingdns/config.json: db_engine=%s, db_host=%s, db_user=%s, db_name=%s", engine, host, user, db))
	job.write("[INFO]   3. Run: systemctl restart dingdns")
	job.write("[INFO]   4. DingDns will auto-create tables on start")
	job.write("[INFO] ")
	job.write("[DONE] Preparation complete. Follow the steps above to finish migration.")
}

// ──────────────────────────────────────────────
// System helpers
// ──────────────────────────────────────────────

// countIPTablesInputRules returns the number of user-defined rules in the
// INPUT chain (i.e. excluding the implicit policy line). 0 means either
// no rules OR detection failed; caller must distinguish via the second
// return value (true=detection worked).
//
// iptables(8) needs root, but the dingdns service user has a NOPASSWD
// sudoers entry for /usr/sbin/iptables, so we go through runSudo here.
// Without that, this used to silently return 0 and our hint message
// would incorrectly say "no firewall" on systems that actually had a
// fully-configured iptables firewall.
func countIPTablesInputRules() (n int, ok bool) {
	for _, p := range []string{"/usr/sbin/iptables", "/sbin/iptables", "/usr/bin/iptables"} {
		if _, err := os.Stat(p); err != nil {
			continue
		}
		out, err := runSudo(p, "-S", "INPUT")
		if err != nil {
			continue
		}
		// `iptables -S INPUT` prints one `-P INPUT …` policy line followed
		// by one `-A INPUT …` line per user rule. Subtract the policy.
		var rules int
		for _, line := range strings.Split(out, "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "-A INPUT") {
				rules++
			}
		}
		return rules, true
	}
	return 0, false
}

// firewallHint returns a non-empty string when this row should display a
// soft hint instead of being interpreted as a hard failure. UFW being
// inactive is normal on systems that drive iptables directly (which is
// exactly what install.sh sets up via the dingdns-firewall sudoers entry),
// so we should not draw it as a red "dead" service in that case.
func firewallHint(name string, installed bool, active bool) string {
	if name != "ufw" || active {
		return ""
	}
	n, ok := countIPTablesInputRules()
	if ok && n > 0 {
		if !installed {
			return fmt.Sprintf("UFW not installed — but iptables has %d INPUT rule(s) so the firewall IS active. UFW is just an alternative frontend; you don't need it.", n)
		}
		return fmt.Sprintf("UFW is inactive — but iptables has %d INPUT rule(s) so the firewall IS active. UFW is just an alternative frontend; you don't need to enable it.", n)
	}
	if !installed {
		return "UFW not installed. iptables has no INPUT rules either, so traffic to non-system ports is unrestricted. Add rules under Security → Firewall, or click Install for UFW."
	}
	return "UFW is inactive. iptables has no INPUT rules either, so traffic to non-system ports is unrestricted. Add rules under Security → Firewall, or click Start for UFW."
}

// synthesizeFirewallStatus returns a synthetic "firewall" row that
// aggregates iptables + UFW state into a single yes/no signal. It is
// prepended to the Services list so users see a clear answer to
// "do I have a firewall?" without having to interpret the UFW row's
// hint. The row has installable=false and no PID/Memory — it isn't a
// systemd unit, it's a synthesized status indicator.
func synthesizeFirewallStatus() map[string]interface{} {
	ufwActive := false
	if out, err := exec.Command("systemctl", "is-active", "ufw").Output(); err == nil {
		if strings.TrimSpace(string(out)) == "active" {
			ufwActive = true
		}
	}
	ipN, ipOk := countIPTablesInputRules()
	ipActive := ipOk && ipN > 0

	row := map[string]interface{}{
		"name":         "firewall",
		"description":  "Effective firewall (iptables and/or UFW)",
		"installed":    true,
		"installable":  false,
		"synthetic":    true,
	}
	switch {
	case ipActive && ufwActive:
		row["status"] = "active"
		row["active"] = true
		row["hint"] = fmt.Sprintf("Firewall is ACTIVE: iptables has %d INPUT rule(s) and UFW is running.", ipN)
	case ipActive:
		row["status"] = "active"
		row["active"] = true
		row["hint"] = fmt.Sprintf("Firewall is ACTIVE via iptables (%d INPUT rule(s)). UFW is not in use — that's fine.", ipN)
	case ufwActive:
		row["status"] = "active"
		row["active"] = true
		row["hint"] = "Firewall is ACTIVE via UFW."
	default:
		row["status"] = "inactive"
		row["active"] = false
		row["hint"] = "Firewall is INACTIVE: iptables has no INPUT rules and UFW is not running. Add rules under Security → Firewall."
	}
	return row
}

func getServiceDetail(name string) map[string]interface{} {
	// Check if the unit exists. If not, return a "not-installed" stub so
	// the panel can render it differently (with an Install button) instead
	// of silently hiding the row — the previous behaviour was confusing
	// because UFW being "dead" vs being "absent" looked identical from
	// the user's perspective.
	checkCmd := exec.Command("systemctl", "cat", name)
	if err := checkCmd.Run(); err != nil {
		// Only expose this stub for services we know how to install. For
		// everything else, keep the historical behaviour of hiding the row
		// so the panel doesn't fill up with noise on minimal systems.
		if !installableServices[name] {
			return nil
		}
		result := map[string]interface{}{
			"name":        name,
			"status":      "not-installed",
			"sub_state":   "",
			"active":      false,
			"installed":   false,
			"installable": true,
			"load_state":  "not-found",
		}
		if hint := firewallHint(name, false, false); hint != "" {
			result["hint"] = hint
		}
		return result
	}

	result := map[string]interface{}{
		"name":        name,
		"installed":   true,
		"installable": installableServices[name],
	}

	cmd := exec.Command("systemctl", "show", name,
		"--property=ActiveState,SubState,LoadState,Description,ActiveEnterTimestamp,MemoryCurrent,MainPID,UnitFileState",
		"--no-pager")
	out, err := cmd.Output()
	if err != nil {
		result["status"] = "unknown"
		result["active"] = false
		return result
	}

	props := parseSystemctlProps(string(out))
	activeState := props["ActiveState"]
	subState := props["SubState"]

	result["status"] = activeState
	result["sub_state"] = subState
	result["active"] = activeState == "active"
	result["load_state"] = props["LoadState"]
	result["description"] = props["Description"]
	result["pid"] = props["MainPID"]
	// UnitFileState is "enabled" / "disabled" / "static" / "masked" / ""
	// — exposing it lets the UI distinguish "installed but disabled on
	// boot" from "installed and enabled but stopped".
	if ufs := props["UnitFileState"]; ufs != "" {
		result["enabled"] = ufs == "enabled" || ufs == "enabled-runtime"
		result["unit_file_state"] = ufs
	}

	if ts := props["ActiveEnterTimestamp"]; ts != "" && ts != "n/a" {
		result["since"] = ts
	}
	if mem := props["MemoryCurrent"]; mem != "" && mem != "[not set]" && mem != "18446744073709551615" {
		if bytes, parseErr := strconv.ParseInt(mem, 10, 64); parseErr == nil && bytes > 0 {
			result["memory_bytes"] = bytes
			result["memory_mb"] = fmt.Sprintf("%.1f", float64(bytes)/1024/1024)
		}
	}

	if hint := firewallHint(name, true, activeState == "active"); hint != "" {
		result["hint"] = hint
	}

	return result
}

func parseSystemctlProps(output string) map[string]string {
	props := map[string]string{}
	for _, line := range strings.Split(output, "\n") {
		if idx := strings.Index(line, "="); idx > 0 {
			props[strings.TrimSpace(line[:idx])] = strings.TrimSpace(line[idx+1:])
		}
	}
	return props
}

func getCPUUsage() map[string]interface{} {
	out, err := exec.Command("sh", "-c", "top -bn1 | head -3 | tail -1").Output()
	if err != nil {
		return map[string]interface{}{"error": "unavailable"}
	}
	return map[string]interface{}{"raw": strings.TrimSpace(string(out))}
}

func getMemoryUsage() map[string]interface{} {
	out, err := exec.Command("free", "-m").Output()
	if err != nil {
		return map[string]interface{}{"error": "unavailable"}
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) >= 2 {
		fields := strings.Fields(lines[1])
		if len(fields) >= 7 {
			return map[string]interface{}{
				"total_mb":     fields[1],
				"used_mb":      fields[2],
				"free_mb":      fields[3],
				"available_mb": fields[6],
			}
		}
	}
	return map[string]interface{}{"raw": strings.TrimSpace(string(out))}
}

func getDiskUsage() map[string]interface{} {
	out, err := exec.Command("df", "-h", "/").Output()
	if err != nil {
		return map[string]interface{}{"error": "unavailable"}
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) >= 2 {
		fields := strings.Fields(lines[1])
		if len(fields) >= 6 {
			return map[string]interface{}{
				"total":   fields[1],
				"used":    fields[2],
				"free":    fields[3],
				"percent": fields[4],
				"mount":   fields[5],
			}
		}
	}
	return map[string]interface{}{"raw": strings.TrimSpace(string(out))}
}

func getLoadAverage() map[string]interface{} {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return map[string]interface{}{"error": "unavailable"}
	}
	fields := strings.Fields(string(data))
	if len(fields) >= 3 {
		return map[string]interface{}{
			"1min":  fields[0],
			"5min":  fields[1],
			"15min": fields[2],
		}
	}
	return map[string]interface{}{"raw": strings.TrimSpace(string(data))}
}

func logAction(c *gin.Context, action, resource string, resourceID *uint, details string) {
	adminID := core.GetAdminID(c)
	var aidPtr *uint
	if adminID > 0 {
		aidPtr = &adminID
	}
	models.DB.Create(&models.AuditLog{
		UserID: aidPtr, Action: action, Resource: resource,
		ResourceID: resourceID, Details: details, IP: c.ClientIP(),
	})
}
