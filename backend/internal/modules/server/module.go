package server

import (
	"github.com/dingdns/dingdns/internal/core"
	"github.com/gin-gonic/gin"
)

type ServerModule struct {
	core.BaseModule
	handler *Handler
}

func New() *ServerModule {
	return &ServerModule{handler: NewHandler()}
}

func (m *ServerModule) ID() string   { return "server" }
func (m *ServerModule) Name() string { return "Server" }
func (m *ServerModule) Icon() string { return "CloudServerOutlined" }

func (m *ServerModule) Permissions() []core.Permission {
	return []core.Permission{
		{Key: "server.view", Label: "View Server Status", Description: "View server status, logs, and resources"},
		{Key: "server.manage", Label: "Manage Server", Description: "Restart services, edit config, backup, database"},
	}
}

func (m *ServerModule) MenuItems() []core.MenuItem {
	return []core.MenuItem{
		{Label: "Status", Path: "/server/status", Icon: "DashboardOutlined", Permission: "server.view"},
		{Label: "Services", Path: "/server/services", Icon: "AppstoreOutlined", Permission: "server.view"},
		{Label: "Logs", Path: "/server/logs", Icon: "FileTextOutlined", Permission: "server.view"},
		{Label: "Configuration", Path: "/server/config", Icon: "SettingOutlined", Permission: "server.manage"},
		{Label: "Backup", Path: "/server/backup", Icon: "CloudDownloadOutlined", Permission: "server.manage"},
		{Label: "SSL Certificate", Path: "/server/ssl", Icon: "SafetyCertificateOutlined", Permission: "server.manage"},
		{Label: "System Updates", Path: "/server/updates", Icon: "CloudDownloadOutlined", Permission: "server.view"},
	}
}

func (m *ServerModule) RegisterRoutes(r *gin.RouterGroup) {
	srv := r.Group("/server")
	{
		// Status
		srv.GET("/status", core.RequirePermission("server.view"), m.handler.GetStatus)

		// Services
		srv.GET("/services", core.RequirePermission("server.view"), m.handler.GetServices)
		srv.POST("/services/:name/start", core.RequirePermission("server.manage"), m.handler.StartService)
		srv.POST("/services/:name/stop", core.RequirePermission("server.manage"), m.handler.StopService)
		srv.POST("/services/:name/restart", core.RequirePermission("server.manage"), m.handler.RestartService)
		srv.GET("/services/:name/logs", core.RequirePermission("server.view"), m.handler.GetServiceLogs)

		// Logs
		srv.GET("/logs", core.RequirePermission("server.view"), m.handler.GetLogs)

		// Configuration
		srv.GET("/config", core.RequirePermission("server.manage"), m.handler.GetConfig)
		srv.PUT("/config", core.RequirePermission("server.manage"), m.handler.UpdateConfig)

		// Backup & Restore
		srv.GET("/backup", core.RequirePermission("server.manage"), m.handler.DownloadBackup) // legacy
		srv.GET("/backups", core.RequirePermission("server.manage"), m.handler.ListBackups)
		srv.POST("/backups", core.RequirePermission("server.manage"), m.handler.CreateBackup)
		srv.GET("/backups/:name", core.RequirePermission("server.manage"), m.handler.DownloadBackupFile)
		srv.DELETE("/backups/:name", core.RequirePermission("server.manage"), m.handler.DeleteBackupFile)
		srv.POST("/backups/:name/restore", core.RequirePermission("server.manage"), m.handler.RestoreBackup)

		// Database
		srv.GET("/database-info", core.RequirePermission("server.view"), m.handler.GetDatabaseInfo)
		srv.GET("/db-engines", core.RequirePermission("server.manage"), m.handler.GetDBEngines)
		srv.POST("/db-test", core.RequirePermission("server.manage"), m.handler.TestDBConnection)
		srv.POST("/db-migrate", core.RequirePermission("server.manage"), m.handler.StartDBMigration)
		srv.GET("/db-migrate/:id", core.RequirePermission("server.manage"), m.handler.GetMigrationJob)


		// System updates (check GitHub for new commits + trigger installer --update)
		srv.GET("/update/info", core.RequirePermission("server.view"), m.handl