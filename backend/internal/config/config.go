package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config holds all application configuration
type Config struct {
	// Server settings
	Domain    string `json:"domain"`
	HTTPPort  string `json:"http_port"`
	HTTPSPort string `json:"https_port"`
	DNSPort   string `json:"dns_port"`

	// Database
	DBPath string `json:"db_path"`

	// JWT
	JWTSecret     string `json:"jwt_secret"`
	JWTExpireHours int    `json:"jwt_expire_hours"`

	// SSL
	SSLEnabled bool   `json:"ssl_enabled"`
	SSLCert    string `json:"ssl_cert"`
	SSLKey     string `json:"ssl_key"`

	// DNS settings
	DefaultTTL  uint32 `json:"default_ttl"`
	NSPrimary   string `json:"ns_primary"`
	NSSecondary string `json:"ns_secondary"`
	AdminEmail  string `json:"admin_email"`

	// Data directory
	DataDir string `json:"data_dir"`
}

// DefaultConfig returns a config with sane defaults
func DefaultConfig() *Config {
	return &Config{
		Domain:         "dingdns.com",
		HTTPPort:       "8080",
		HTTPSPort:      "443",
		DNSPort:        "53",
		DBPath:         "/opt/dingdns/data/dingdns.db",
		JWTSecret:      "",
		JWTExpireHours: 24,
		SSLEnabled:     false,
		SSLCert:        "/opt/dingdns/ssl/cert.pem",
		SSLKey:         "/opt/dingdns/ssl/key.pem",
		DefaultTTL:     300,
		NSPrimary:      "ns1.dingdns.com",
		NSSecondary:    "ns2.dingdns.com",
		AdminEmail:     "admin@dingdns.com",
		DataDir:        "/opt/dingdns/data",
	}
}

// Load reads config from a JSON file
func Load(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Create default config file
			if err := cfg.Save(path); err != nil {
				return nil, err
			}
			return cfg, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Save writes config to a JSON file
func (c *Config) Save(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}
