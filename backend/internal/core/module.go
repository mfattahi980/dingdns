package core

import "github.com/gin-gonic/gin"

// Permission represents a single permission
type Permission struct {
	Key         string `json:"key"`          // e.g., "dns.view"
	Label       string `json:"label"`        // e.g., "View DNS Zones"
	Description string `json:"description"`  // e.g., "Allows viewing DNS zones and records"
}

// MenuItem represents a menu entry in the admin panel
type MenuItem struct {
	Label      string     `json:"label"`
	Path       string     `json:"path"`
	Icon       string     `json:"icon,omitempty"`
	Permission string     `json:"permission,omitempty"` // required permission key
	Children   []MenuItem `json:"children,omitempty"`
}

// Module represents a pluggable admin module
type Module interface {
	// ID returns the unique module identifier
	ID() string
	// Name returns the display name
	Name() string
	// Icon returns the icon name (Ant Design icon)
	Icon() string
	// Permissions returns all permissions this module defines
	Permissions() []Permission
	// MenuItems returns the menu structure for this module
	MenuItems() []MenuItem
	// RegisterRoutes registers API routes for this module
	RegisterRoutes(group *gin.RouterGroup)
	// RegisterPublicRoutes registers routes that don't need admin auth (optional)
	RegisterPublicRoutes(group *gin.RouterGroup)
	// Models returns GORM models for auto-migration (optional)
	Models() []interface{}
	// OnInit is called when the module is initialized (optional setup)
	OnInit() error
}

// BaseModule provides default implementations for optional Module methods
type BaseModule struct{}

func (b *BaseModule) RegisterPublicRoutes(group *gin.RouterGroup) {}
func (b *BaseModule) Models() []interface{}                       { return nil }
func (b *BaseModule) OnInit() error                               { return nil }

// --- Module Registry ---

var registry []Module

// RegisterModule adds a module to the registry
func RegisterModule(m Module) {
	registry = append(registry, m)
}

// GetModules returns all registered modules
func GetModules() []Module {
	return registry
}

// GetModule returns a module by ID
func GetModule(id string) Module {
	for _, m := range registry {
		if m.ID() == id {
			return m
		}
	}
	return nil
}

// GetAllPermissions returns all permissions from all modules
func GetAllPermissions() []Permission {
	var perms []Permission
	for _, m := range registry {
		perms = append(perms, m.Permissions()...)
	}
	return perms
}

// GetAllMenuItems returns menu items for an admin based on their permissions
func GetAllMenuItems(adminPermissions []string) []map[string]interface{} {
	permSet := make(map[string]bool)
	for _, p := range adminPermissions {
		permSet[p] = true
	}

	var menus []map[string]interface{}
	for _, m := range registry {
		items := filterMenuItems(m.MenuItems(), permSet)
		if len(items) > 0 {
			menus = append(menus, map[string]interface{}{
				"id":       m.ID(),
				"name":     m.Name(),
				"icon":     m.Icon(),
				"children": items,
			})
		}
	}
	return menus
}

// GetAllModels returns all models from all modules for migration
func GetAllModels() []interface{} {
	var models []interface{}
	for _, m := range registry {
		models = append(models, m.Models()...)
	}
	return models
}

func filterMenuItems(items []MenuItem, perms map[string]bool) []MenuItem {
	// If admin has wildcard permission (*), show everything
	if perms["*"] {
		return items
	}

	var filtered []MenuItem
	for _, item := range items {
		if item.Permission == "" || perms[item.Permission] || hasWildcard(item.Permission, perms) {
			filteredItem := item
			if len(item.Children) > 0 {
				filteredItem.Children = filterMenuItems(item.Children, perms)
				if len(filteredItem.Children) == 0 {
					continue
				}
			}
			filtered = append(filtered, filteredItem)
		}
	}
	return filtered
}

// hasWildcard checks if a permission like "dns.view" is covered by "dns.*"
func hasWildcard(perm string, perms map[string]bool) bool {
	for p := range perms {
		if len(p) > 2 && p[len(p)-2:] == ".*" {
			prefix := p[:len(p)-2]
			if len(perm) > len(prefix) && perm[:len(prefix)] == prefix {
				return true
			}
		}
	}
	return false
}
