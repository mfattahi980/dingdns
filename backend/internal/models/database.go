package models

import (
	"os"
	"path/filepath"

	"github.com/dingdns/dingdns/internal/core"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// InitDB initializes the database connection and runs migrations
func InitDB(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return err
	}

	DB.Exec("PRAGMA journal_mode=WAL")
	DB.Exec("PRAGMA foreign_keys=ON")

	// Set DB reference in core package
	core.SetDB(DB)

	// Core models (admin system)
	coreModels := []interface{}{
		&core.Admin{},
		&core.AdminSession{},
		&core.AdminIPAllowlist{},
		&core.TOTPSecret{},
	}

	// Application models
	appModels := []interface{}{
		&Zone{},
		&Record{},
		&DDNSToken{},
		&AuditLog{},
		&Setting{},
		&IPBan{},
		&LoginAttempt{},
		&APIKey{},
		&FirewallRule{},
		&APIUsageLog{},
	}

	// Module models
	moduleModels := core.GetAllModels()

	// Merge all and migrate
	allModels := append(coreModels, appModels...)
	allModels = append(allModels, moduleModels...)

	if err := DB.AutoMigrate(allModels...); err != nil {
		return err
	}

	return nil
}
