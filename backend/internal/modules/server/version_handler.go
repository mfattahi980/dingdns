package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/dingdns/dingdns/internal/core"
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

// VersionInfo is what we return to the panel.
type VersionInfo struct {
	CurrentVersion  string `json:"current_version"`
	CurrentCommit   string `json:"current_commit"`
	LatestCommit    string `json:"latest_commit"`
	LatestMessage   string `json:"latest_message"`
	LatestCommittedAt string `json:"latest_committed_at"`
	UpdateAvailable bool   `json:"update_available"`
	CheckError      string `json:"check_error,omitempty"`
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

// TriggerUpdate handles POST /admin/api/server/update.
// Runs the installer in --update mode in a detached background process.
// The installer will stop the service, rebuild, and start it again — so
// the panel will briefly become unreachable during the rebuild. We return
// immediately with a "started" status; the panel can poll GetVersionInfo
// after a minute to confirm the new commit is live.
func (h *Handler) TriggerUpdate(c *gin.Context) {
	// We launch the installer's --update flow via sh -c so we can fire-and-forget.
	// nohup keeps it alive after the parent (dingdns binary) is restarted.
	// Output goes to /var/log/dingdns/update.log for diagnostics.
	const updateCmd = `nohup bash -c '` +
		`curl -sSL https://raw.githubusercontent.com/` + updateRepoOwner + `/` + updateRepoName + `/` + updateBranch +
		`/installer/install.sh | bash -s -- --update` +
		`' > /var/log/dingdns/update.log 2>&1 &`

	cmd := exec.Command("sudo", "-n", "sh", "-c", updateCmd)
	if err := cmd.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to launch updater: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "started",
		"log":     "/var/log/dingdns/update.log",
		"message": "Update started. The service will restart shortly. Reload the panel in ~1 minute.",
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
