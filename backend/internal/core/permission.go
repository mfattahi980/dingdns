package core

import (
	"encoding/json"
	"strings"
)

// ParsePermissions parses a permissions string (JSON array or "*")
func ParsePermissions(permsStr string) []string {
	if permsStr == "*" {
		return []string{"*"}
	}

	var perms []string
	if err := json.Unmarshal([]byte(permsStr), &perms); err != nil {
		// Try comma-separated as fallback
		for _, p := range strings.Split(permsStr, ",") {
			p = strings.TrimSpace(p)
			if p != "" {
				perms = append(perms, p)
			}
		}
	}
	return perms
}

// EncodePermissions encodes permissions to JSON string
func EncodePermissions(perms []string) string {
	if len(perms) == 1 && perms[0] == "*" {
		return "*"
	}
	data, _ := json.Marshal(perms)
	return string(data)
}

// ValidatePassword checks password strength
// Returns error message or empty string if valid
func ValidatePassword(password string) string {
	if len(password) < 8 {
		return "password must be at least 8 characters"
	}

	hasUpper := false
	hasLower := false
	hasDigit := false
	hasSpecial := false

	for _, c := range password {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= 'a' && c <= 'z':
			hasLower = true
		case c >= '0' && c <= '9':
			hasDigit = true
		default:
			hasSpecial = true
		}
	}

	if !hasUpper {
		return "password must contain at least one uppercase letter"
	}
	if !hasLower {
		return "password must contain at least one lowercase letter"
	}
	if !hasDigit {
		return "password must contain at least one digit"
	}
	if !hasSpecial {
		return "password must contain at least one special character"
	}

	return ""
}
