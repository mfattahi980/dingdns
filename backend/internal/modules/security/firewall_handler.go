package security

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

// ──────────────────────────────────────────────
// Tool detection
// ──────────────────────────────────────────────

type firewallTool struct {
	path     string
	toolType string // "iptables" | "ufw" | "none"
}

func detectFirewall() firewallTool {
	// iptables paths (Debian/Ubuntu)
	for _, p := range []string{
		"/usr/sbin/iptables",
		"/usr/bin/iptables",
		"/sbin/iptables",
	} {
		if _, err := os.Stat(p); err == nil {
			return firewallTool{path: p, toolType: "iptables"}
		}
	}
	// ufw fallback
	for _, p := range []string{
		"/usr/sbin/ufw",
		"/usr/bin/ufw",
	} {
		if _, err := os.Stat(p); err == nil {
			return firewallTool{path: p, toolType: "ufw"}
		}
	}
	return firewallTool{toolType: "none"}
}

// runCmd executes a command, trying without sudo first, then with sudo.
func runCmd(bin string, args ...string) (string, error) {
	// First try directly (works if running as root)
	if os.Getuid() == 0 {
		out, err := exec.Command(bin, args...).CombinedOutput()
		return string(out), err
	}
	// Non-root: use sudo
	sudoArgs := append([]string{bin}, args...)
	out, err := exec.Command("sudo", sudoArgs...).CombinedOutput()
	return string(out), err
}

// ──────────────────────────────────────────────
// HTTP handlers
// ──────────────────────────────────────────────

// ListFirewallRules returns all firewall rules from DB
func (h *Handler) ListFirewallRules(c *gin.Context) {
	var rules []models.FirewallRule
	models.DB.Order("created_at desc").Find(&rules)

	tool := detectFirewall()
	c.JSON(http.StatusOK, gin.H{
		"rules":      rules,
		"tool":       tool.toolType,
		"tool_path":  tool.path,
		"has_sudo":   hasSudoAccess(tool),
	})
}

// AddFirewallRule creates a new rule in DB and applies it
func (h *Handler) AddFirewallRule(c *gin.Context) {
	var req struct {
		Chain    string `json:"chain" binding:"required"`
		Action   string `json:"action" binding:"required"`
		Protocol string `json:"protocol"`
		SrcIP    string `json:"src_ip"`
		DstIP    string `json:"dst_ip"`
		DstPort  string `json:"dst_port"`
		Comment  string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chain and action are required"})
		return
	}

	validChains := map[string]bool{"INPUT": true, "OUTPUT": true, "FORWARD": true}
	validActions := map[string]bool{"ACCEPT": true, "DROP": true, "REJECT": true}
	if !validChains[strings.ToUpper(req.Chain)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid chain (INPUT/OUTPUT/FORWARD)"})
		return
	}
	if !validActions[strings.ToUpper(req.Action)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action (ACCEPT/DROP/REJECT)"})
		return
	}

	rule := models.FirewallRule{
		Chain:    strings.ToUpper(req.Chain),
		Action:   strings.ToUpper(req.Action),
		Protocol: req.Protocol,
		SrcIP:    req.SrcIP,
		DstIP:    req.DstIP,
		DstPort:  req.DstPort,
		Comment:  req.Comment,
		IsActive: true,
	}

	if err := models.DB.Create(&rule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save rule"})
		return
	}

	tool := detectFirewall()
	var applyErr error
	if tool.toolType != "none" {
		applyErr = applyRule(tool, "-I", rule)
	}

	logAction(c, "add_firewall_rule", "firewall", &rule.ID,
		fmt.Sprintf("%s %s src=%s port=%s", rule.Chain, rule.Action, rule.SrcIP, rule.DstPort))

	if applyErr != nil {
		c.JSON(http.StatusCreated, gin.H{
			"rule":    rule,
			"warning": "Rule saved but could not apply to firewall: " + applyErr.Error(),
		})
		return
	}
	c.JSON(http.StatusCreated, rule)
}

// DeleteFirewallRule removes a rule from DB and the active firewall
func (h *Handler) DeleteFirewallRule(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var rule models.FirewallRule
	if err := models.DB.First(&rule, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}

	tool := detectFirewall()
	var removeErr error
	if tool.toolType != "none" {
		removeErr = applyRule(tool, "-D", rule)
	}

	models.DB.Delete(&rule)
	logAction(c, "delete_firewall_rule", "firewall", &rule.ID,
		fmt.Sprintf("%s %s", rule.Chain, rule.Action))

	if removeErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "Rule deleted from database",
			"warning": "Could not remove from active firewall: " + removeErr.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Rule deleted"})
}

// GetSystemRules returns the live firewall status
func (h *Handler) GetSystemRules(c *gin.Context) {
	tool := detectFirewall()

	if tool.toolType == "none" {
		c.JSON(http.StatusOK, gin.H{
			"output":   "",
			"tool":     "none",
			"message":  "No firewall tool found. Install iptables: apt install iptables",
		})
		return
	}

	chain := c.DefaultQuery("chain", "")
	var output string
	var err error

	switch tool.toolType {
	case "iptables":
		if chain != "" {
			output, err = runCmd(tool.path, "-L", chain, "-n", "-v", "--line-numbers")
		} else {
			output, err = runCmd(tool.path, "-L", "-n", "-v", "--line-numbers")
		}
	case "ufw":
		output, err = runCmd(tool.path, "status", "numbered")
	}

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"output":  output,
			"tool":    tool.toolType,
			"message": "Command failed: " + err.Error() + "\nTip: ensure sudo access is configured.",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"output": output, "tool": tool.toolType})
}

// SyncFirewallRules re-applies all active DB rules
func (h *Handler) SyncFirewallRules(c *gin.Context) {
	tool := detectFirewall()
	if tool.toolType == "none" {
		c.JSON(http.StatusOK, gin.H{"message": "No firewall tool available to sync"})
		return
	}
	ApplyAllFirewallRules()
	logAction(c, "sync_firewall", "firewall", nil, "manual sync")
	c.JSON(http.StatusOK, gin.H{"message": "Firewall rules synced to " + tool.toolType})
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

// ApplyAllFirewallRules is called on startup to restore saved rules
func ApplyAllFirewallRules() {
	tool := detectFirewall()
	if tool.toolType == "none" {
		return
	}
	var rules []models.FirewallRule
	models.DB.Where("is_active = ?", true).Find(&rules)
	for _, rule := range rules {
		// Ignore errors — rule may already be present
		applyRule(tool, "-I", rule) //nolint
	}
}

// applyRule adds or removes a single rule using the detected tool
func applyRule(tool firewallTool, op string, rule models.FirewallRule) error {
	switch tool.toolType {
	case "iptables":
		return applyIPTablesRule(tool.path, op, rule)
	case "ufw":
		return applyUFWRule(op, rule)
	}
	return fmt.Errorf("unsupported tool: %s", tool.toolType)
}

// applyIPTablesRule builds and runs an iptables command
func applyIPTablesRule(path, op string, rule models.FirewallRule) error {
	args := []string{op, rule.Chain}

	if rule.Protocol != "" && rule.Protocol != "all" {
		args = append(args, "-p", rule.Protocol)
	}
	if rule.SrcIP != "" {
		args = append(args, "-s", rule.SrcIP)
	}
	if rule.DstIP != "" {
		args = append(args, "-d", rule.DstIP)
	}
	if rule.DstPort != "" && (rule.Protocol == "tcp" || rule.Protocol == "udp") {
		// Support port ranges (e.g. "8000:9000")
		if strings.Contains(rule.DstPort, ":") {
			args = append(args, "-m", "multiport", "--dports", strings.ReplaceAll(rule.DstPort, ":", ","))
		} else {
			args = append(args, "--dport", rule.DstPort)
		}
	}
	// Tag our rules with a comment for identification
	args = append(args, "-m", "comment", "--comment", fmt.Sprintf("dingdns-%d", rule.ID))
	args = append(args, "-j", rule.Action)

	out, err := runCmd(path, args...)
	if err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(out))
	}
	return nil
}

// applyUFWRule translates a FirewallRule to a ufw command
func applyUFWRule(op string, rule models.FirewallRule) error {
	if op == "-D" {
		// UFW deletion requires matching the original allow/deny rule
		// We'll use "delete" subcommand with the rule spec
		args := buildUFWArgs("delete", rule)
		if args == nil {
			return fmt.Errorf("cannot build UFW delete rule")
		}
		out, err := runCmd("/usr/sbin/ufw", args...)
		if err != nil {
			// Try /usr/bin/ufw
			out, err = runCmd("/usr/bin/ufw", args...)
		}
		if err != nil {
			return fmt.Errorf("%w: %s", err, strings.TrimSpace(out))
		}
		return nil
	}

	args := buildUFWArgs("", rule)
	if args == nil {
		return fmt.Errorf("cannot build UFW rule")
	}

	ufwPath := "/usr/sbin/ufw"
	if _, err := os.Stat(ufwPath); err != nil {
		ufwPath = "/usr/bin/ufw"
	}
	out, err := runCmd(ufwPath, args...)
	if err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(out))
	}
	return nil
}

// buildUFWArgs builds ufw command arguments for a rule
func buildUFWArgs(prefix string, rule models.FirewallRule) []string {
	// ufw works on INPUT-like semantics by default; OUTPUT/FORWARD require 'out'/'route'
	action := strings.ToLower(rule.Action) // allow / deny / reject

	var args []string
	if prefix != "" {
		args = append(args, prefix)
	}
	args = append(args, action)

	if rule.SrcIP != "" {
		args = append(args, "from", rule.SrcIP)
	} else {
		args = append(args, "from", "any")
	}

	if rule.DstPort != "" {
		proto := rule.Protocol
		if proto == "" || proto == "all" {
			proto = "tcp"
		}
		args = append(args, "to", "any", "port", rule.DstPort, "proto", proto)
	}

	return args
}

// hasSudoAccess tests if we can actually run the tool
func hasSudoAccess(tool firewallTool) bool {
	if tool.toolType == "none" {
		return false
	}
	_, err := runCmd(tool.path, "--version")
	return err == nil
}
