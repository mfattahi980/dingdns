package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GitHub repo we check for updates against.
// If you ever fork the repo, change these two constants — that's the only
// place the update flow refers to the upstream.
const (
	updateRepoOwner = "mfattahi980"
	updateRepoName  = "dingdns"
	updateBranch    = "main"
)

// commitFile records the git commit SHA that was deployed by the installer.
// install.sh writes `git rev-parse HEAD` here on every install / update.
const commitFile = "/opt/dingdns/.installed-commit"

// Files we use to track the currently-running (or last-run) update.
// They live in the existing log dir so the new binary picks them up after
// the systemctl restart that the installer performs mid-update.
const (
	updateLogDir   = "/var/log/dingdns"
	updateLogFile  = "/var/log/dingdns/update-current.log"
	updateMetaFile = "/var/log/dingdns/update-current.json"
)

// VersionInfo is what we return to the panel.
type VersionInfo struct {
	CurrentVersion    string `json:"current_version"`
	CurrentCommit     string `json:"current_commit"`
	LatestCommit      string `json:"latest_commit"`
	LatestMessage     string `json:"latest_message"`
	LatestCommittedAt string `json:"latest_committed_at"`
	UpdateAvailable   bool   `json:"update_available"`
	CheckError        string `json:"check_error,omitempty"`
}

// readCurrentCommit reads /opt/dingdns/.installed-commit (written by install.sh).
// Returns empty string if the file doesn't exist (e.g. for someone who installed
// before this feature shipped — they'll just see "unknown" until next update).
func readCurrentCommit() string {
	data, err := os.ReadFile(commitFile)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// fetchLatestCommit hits the GitHub commits API for the configured branch.
// We don't need a token — public repos allow unauthenticated reads with
// a 60-req/hour rate limit per IP, which is way more than we need.
func fetchLatestCommit(ctx context.Context) (sha, message, when string, err error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/commits/%s",
		updateRepoOwner, updateRepoName, updateBranch)

	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("User-Agent", "dingdns-update-checker")
	req.Header.Set("Accept", "application/vnd.github+json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", "", "", fmt.Errorf("github API returned %d: %s", resp.StatusCode, string(body))
	}

	var payload struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", "", "", err
	}
	return payload.SHA, payload.Commit.Message, payload.Commit.Author.Date, nil
}

// GetVersionInfo handles GET /admin/api/server/update/info.
func (h *Handler) GetVersionInfo(c *gin.Context) {
	info := VersionInfo{
		CurrentVersion: getRuntimeVersion(),
		CurrentCommit:  readCurrentCommit(),
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	sha, msg, when, err := fetchLatestCommit(ctx)
	if err != nil {
		info.CheckError = err.Error()
		c.JSON(http.StatusOK, info)
		return
	}
	info.LatestCommit = sha
	info.LatestMessage = strings.SplitN(msg, "\n", 2)[0] // first line only
	info.LatestCommittedAt = when

	// If we have no record of what we installed, assume up-to-date so we
	// don't nag users who installed before this feature existed.
	if info.CurrentCommit == "" {
		info.UpdateAvailable = false
	} else {
		info.UpdateAvailable = !strings.EqualFold(info.CurrentCommit, info.LatestCommit)
	}

	c.JSON(http.StatusOK, info)
}

// ─────────────────────────────────────────────────────────────────────────
// Update job tracking — the actual installer runs detached and writes its
// stdout/stderr to a known log file. The panel polls /server/update/job/:id
// which parses the log into a structured step list and tails new lines.
// State lives on disk so it survives the systemctl restart that the
// installer triggers mid-update.
// ─────────────────────────────────────────────────────────────────────────

type updateMeta struct {
	ID        string    `json:"id"`
	StartedAt time.Time `json:"started_at"`
}

// UpdateStep is one logical phase of the installer's update flow.
type UpdateStep struct {
	Name       string     `json:"name"`
	Status     string     `json:"status"` // pending | running | done | failed
	StartedAt  *time.Time `json:"started_at,omitempty"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
	Detail     string     `json:"detail,omitempty"`
}

// stepDef describes how to detect a phase from the installer's INFO/OK/FAIL lines.
type stepDef struct {
	Name      string
	StartHits []string // any substring match against an [INFO] line starts it
	EndHits   []string // any substring match against an [  OK] line ends it
}

// Phases of the update() function in installer/install.sh — order matters.
var updateStepDefs = []stepDef{
	{
		Name:      "Detect environment",
		StartHits: []string{"Detecting operating system"},
		EndHits:   []string{"Architecture:"},
	},
	{
		Name:      "Install system dependencies",
		StartHits: []string{"Updating package lists", "Installing required packages"},
		EndHits:   []string{"Dependencies installed"},
	},
	{
		Name:      "Install Go toolchain",
		StartHits: []string{"Installing Go", "Go already installed"},
		EndHits:   []string{"Go installed", "Go already installed"},
	},
	{
		Name:      "Install Node.js",
		StartHits: []string{"Installing Node.js", "Node.js"},
		EndHits:   []string{"Node.js"},
	},
	{
		Name:      "Build admin UI (frontend)",
		StartHits: []string{"Building admin UI"},
		EndHits:   []string{"Frontend built"},
	},
	{
		Name:      "Build backend (Go binary)",
		StartHits: []string{"Building backend"},
		EndHits:   []string{"Backend built"},
	},
	{
		Name:      "Restart DingDns service",
		StartHits: []string{"Backend built"}, // implicit: starts as soon as build finishes
		EndHits:   []string{"DingDns updated and running"},
	},
}

// Marker lines emitted by our wrapper around the installer.
var (
	reExitMarker  = regexp.MustCompile(`^=== END .* exit=(\d+) ===$`)
	reStartMarker = regexp.MustCompile(`^=== START`)
	reInfoLine    = regexp.MustCompile(`\[INFO\]\s+(.*)$`)
	reOKLine      = regexp.MustCompile(`\[  OK\]\s+(.*)$`)
	reFailLine    = regexp.MustCompile(`\[FAIL\]\s+(.*)$`)
	reANSI        = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
)

// stripANSI removes color escape codes so the parser can match cleanly.
func stripANSI(s string) string {
	return reANSI.ReplaceAllString(s, "")
}

// parseUpdateLog walks every line of the installer's log and folds them
// into:
//   - a list of UpdateSteps with start/end markers populated
//   - the overall job status (running | success | failed)
//   - the exit code (if the END marker has been printed)
//   - a finishedAt timestamp (set when status leaves "running")
func parseUpdateLog(content string, startedAt time.Time) (
	steps []UpdateStep, status string, exitCode *int, finishedAt *time.Time,
	currentDetail string,
) {
	// Pre-seed step list as pending.
	steps = make([]UpdateStep, len(updateStepDefs))
	for i, sd := range updateStepDefs {
		steps[i] = UpdateStep{Name: sd.Name, Status: "pending"}
	}

	lines := strings.Split(content, "\n")
	now := time.Now()
	var failedMessage string

	for _, raw := range lines {
		line := strings.TrimRight(stripANSI(raw), "\r")
		if line == "" {
			continue
		}

		// Exit marker?
		if m := reExitMarker.FindStringSubmatch(line); m != nil {
			code, _ := strconv.Atoi(m[1])
			exitCode = &code
			finishedAt = &now
			continue
		}
		if reStartMarker.MatchString(line) {
			continue
		}

		// FAIL line short-circuits everything.
		if m := reFailLine.FindStringSubmatch(line); m != nil {
			failedMessage = strings.TrimSpace(m[1])
			// Mark first non-done step as failed.
			for i := range steps {
				if steps[i].Status == "running" {
					steps[i].Status = "failed"
					t := now
					steps[i].FinishedAt = &t
					steps[i].Detail = failedMessage
					break
				}
				if steps[i].Status == "pending" {
					steps[i].Status = "failed"
					t := now
					steps[i].StartedAt = &t
					steps[i].FinishedAt = &t
					steps[i].Detail = failedMessage
					break
				}
			}
			continue
		}

		if m := reInfoLine.FindStringSubmatch(line); m != nil {
			msg := strings.TrimSpace(m[1])
			currentDetail = msg
			for i, sd := range updateStepDefs {
				for _, h := range sd.StartHits {
					if strings.Contains(msg, h) && steps[i].Status == "pending" {
						steps[i].Status = "running"
						t := now
						steps[i].StartedAt = &t
						// Implicitly close out any earlier "running" steps —
						// the installer is linear so an earlier step is done
						// by the time the next one prints its first INFO.
						for j := 0; j < i; j++ {
							if steps[j].Status == "running" {
								steps[j].Status = "done"
								t2 := now
								steps[j].FinishedAt = &t2
							}
						}
						break
					}
				}
			}
			continue
		}

		if m := reOKLine.FindStringSubmatch(line); m != nil {
			msg := strings.TrimSpace(m[1])
			for i, sd := range updateStepDefs {
				for _, h := range sd.EndHits {
					if strings.Contains(msg, h) && (steps[i].Status == "running" || steps[i].Status == "pending") {
						steps[i].Status = "done"
						t := now
						steps[i].FinishedAt = &t
						if steps[i].StartedAt == nil {
							st := startedAt
							steps[i].StartedAt = &st
						}
					}
				}
			}
			continue
		}
	}

	// Determine overall status.
	switch {
	case exitCode == nil:
		status = "running"
	case *exitCode == 0:
		// Even if exit was 0, double-check no step is marked failed.
		failedAny := false
		for _, s := range steps {
			if s.Status == "failed" {
				failedAny = true
				break
			}
		}
		if failedAny {
			status = "failed"
		} else {
			status = "success"
			// Force any straggling running/pending steps to done.
			for i := range steps {
				if steps[i].Status != "failed" {
					steps[i].Status = "done"
					if steps[i].FinishedAt == nil {
						t := now
						steps[i].FinishedAt = &t
					}
				}
			}
		}
	default:
		status = "failed"
	}
	return
}

// TriggerUpdate handles POST /admin/api/server/update.
//
// It generates a job ID, kicks off the installer wrapped in a small bash
// script that prepends START / appends END markers to the log, writes the
// job metadata to disk so a follow-up GET can find it (even after the
// inevitable restart), and returns the job ID immediately.
func (h *Handler) TriggerUpdate(c *gin.Context) {
	if err := os.MkdirAll(updateLogDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create log dir: " + err.Error()})
		return
	}

	// Block if another update is in flight (no exit marker yet).
	if existing, _ := readUpdateMeta(); existing != nil {
		if existingLog, _ := os.ReadFile(updateLogFile); len(existingLog) > 0 {
			_, st, _, _, _ := parseUpdateLog(string(existingLog), existing.StartedAt)
			if st == "running" {
				c.JSON(http.StatusConflict, gin.H{
					"error":  "an update is already running",
					"job_id": existing.ID,
				})
				return
			}
		}
	}

	id := fmt.Sprintf("upd-%d", time.Now().Unix())
	meta := updateMeta{ID: id, StartedAt: time.Now()}
	metaBytes, _ := json.MarshalIndent(meta, "", "  ")
	if err := os.WriteFile(updateMetaFile, metaBytes, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot write meta: " + err.Error()})
		return
	}

	// Truncate / create the log file so it starts clean.
	if err := os.WriteFile(updateLogFile, []byte{}, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create log file: " + err.Error()})
		return
	}

	// Build the wrapper script.  We use `script` if available so colors etc.
	// behave; otherwise plain bash. Exit code is recorded in the END marker
	// so the parser can detect success/failure even after this binary dies.
	wrapper := fmt.Sprintf(`
set +e
LOG=%s
{
  echo "=== START $(date -Iseconds) id=%s ==="
  curl -sSL https://raw.githubusercontent.com/%s/%s/%s/installer/install.sh | bash -s -- --update
  RC=$?
  echo "=== END $(date -Iseconds) exit=$RC ==="
} >> "$LOG" 2>&1
`, updateLogFile, id, updateRepoOwner, updateRepoName, updateBranch)

	// nohup detaches us from the dingdns process so the installer survives
	// the systemctl restart. We need sudo because the installer touches
	// /opt/dingdns, /usr/local/bin/dingdns, systemctl, etc.
	cmd := exec.Command("sudo", "-n", "nohup", "bash", "-c", wrapper)
	// Detach stdio — wrapper redirects everything to the log file itself.
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to launch updater: " + err.Error(),
		})
		return
	}
	// Don't wait for it — we want fire-and-forget. cmd.Wait() would block.
	go func() { _ = cmd.Wait() }()

	c.JSON(http.StatusOK, gin.H{
		"status":  "started",
		"job_id":  id,
		"log":     updateLogFile,
		"message": "Update started. Poll /server/update/job/" + id + " for status.",
	})
}

// readUpdateMeta loads the current update job metadata from disk.
// Returns nil, nil if there isn't one.
func readUpdateMeta() (*updateMeta, error) {
	b, err := os.ReadFile(updateMetaFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var m updateMeta
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// GetUpdateJob handles GET /admin/api/server/update/job/:id.
//
// The :id can be a real job ID or the literal "current". Returns a snapshot
// of the parsed step list plus an incremental log tail starting at ?offset=N
// (so the UI can keep appending instead of reloading the whole log every
// poll).
func (h *Handler) GetUpdateJob(c *gin.Context) {
	id := c.Param("id")

	meta, err := readUpdateMeta()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "read meta: " + err.Error()})
		return
	}
	if meta == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no update job recorded"})
		return
	}
	if id != "current" && id != meta.ID {
		c.JSON(http.StatusNotFound, gin.H{
			"error":         "job id mismatch — a different (or newer) update has run since",
			"current_job":   meta.ID,
			"requested_job": id,
		})
		return
	}

	// Load the whole log so we can parse the step list.
	logBytes, err := os.ReadFile(updateLogFile)
	if err != nil && !os.IsNotExist(err) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "read log: " + err.Error()})
		return
	}
	full := string(logBytes)

	// Optional ?offset= cursor for incremental log tail.
	offset, _ := strconv.ParseInt(c.DefaultQuery("offset", "0"), 10, 64)
	if offset < 0 {
		offset = 0
	}
	if offset > int64(len(logBytes)) {
		offset = int64(len(logBytes))
	}
	tail := stripANSI(string(logBytes[offset:]))

	steps, status, exitCode, finishedAt, currentDetail := parseUpdateLog(full, meta.StartedAt)

	// Compute a friendly progress percentage.
	totalSteps := len(steps)
	doneSteps := 0
	for _, s := range steps {
		if s.Status == "done" || s.Status == "failed" {
			doneSteps++
		}
	}
	progress := 0
	if totalSteps > 0 {
		progress = doneSteps * 100 / totalSteps
	}
	if status == "success" {
		progress = 100
	}

	c.JSON(http.StatusOK, gin.H{
		"id":              meta.ID,
		"status":          status,
		"started_at":      meta.StartedAt,
		"finished_at":     finishedAt,
		"exit_code":       exitCode,
		"steps":           steps,
		"progress":        progress,
		"current_detail":  currentDetail,
		"log":             tail,
		"log_total_bytes": len(logBytes),
		"next_offset":     int64(len(logBytes)),
	})
}

// getRuntimeVersion is a tiny indirection so handlers.go can stay slim.
// We expose this via a package-level variable that main can set at boot,
// but for now we just read the package-level constant exposed by main —
// since we can't import main, we declare it as a var here that gets
// overwritten at init() time if the build ever sets it via -ldflags.
var runtimeVersion = "dev"

func getRuntimeVersion() string {
	return runtimeVersion
}

// SetRuntimeVersion is called by main.go at startup to make the binary's
// own version string available to the server module.
func SetRuntimeVersion(v string) {
	runtimeVersion = v
}

// utility — silence "filepath" linter when unused on some platforms.
var _ = filepath.Join
