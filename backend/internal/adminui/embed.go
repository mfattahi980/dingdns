package adminui

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed dist/*
var adminFS embed.FS

// DistFS returns the embedded dist filesystem
func DistFS() (fs.FS, error) {
	return fs.Sub(adminFS, "dist")
}

// IndexHTML returns the index.html content for SPA fallback
func IndexHTML() ([]byte, error) {
	return adminFS.ReadFile("dist/index.html")
}

// StaticHandler returns an http.Handler that serves static files from /admin/
func StaticHandler() http.Handler {
	distFS, _ := fs.Sub(adminFS, "dist")
	return http.StripPrefix("/admin/", http.FileServer(http.FS(distFS)))
}

// HasFile checks if a static file exists in the embedded filesystem
func HasFile(path string) bool {
	f, err := adminFS.Open("dist/" + path)
	if err != nil {
		return false
	}
	f.Close()
	return true
}
