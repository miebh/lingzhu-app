// Package global resolves the per-user directories the desktop app uses. The
// layout matches the core's internal/global, so one machine keeps all lingzhu
// state under the user's own directories instead of the source tree.
package global

import (
	"os"
	"path/filepath"
	"runtime"
)

const app = "lingzhu"

// Override returns the directory LINGZHU_HOME points at, if any. It redirects
// data, state, cache and tmp for development runs.
func Override() string { return os.Getenv("LINGZHU_HOME") }

// Config is the directory holding the shared core config.json.
func Config() string {
	if p := os.Getenv("LINGZHU_CONFIG_DIR"); p != "" {
		return p
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(userConfigDir(), app)
	}
	if p := os.Getenv("XDG_CONFIG_HOME"); p != "" {
		return filepath.Join(p, app)
	}
	return filepath.Join(homeDir(), ".config", app)
}

// AppData is the directory holding the app's own database and preferences.
// A development run redirects it under LINGZHU_HOME so it never mixes with
// real user state.
func AppData() string {
	if p := Override(); p != "" {
		return filepath.Join(p, "state")
	}
	return filepath.Join(Config(), "app")
}

// Data is the directory holding durable agent data for every workspace.
func Data() string {
	if p := Override(); p != "" {
		return filepath.Join(p, "data")
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(localAppData(), "data")
	}
	if p := os.Getenv("XDG_DATA_HOME"); p != "" {
		return filepath.Join(p, app)
	}
	return filepath.Join(homeDir(), ".local", "share", app)
}

// Cache is the directory holding disposable files.
func Cache() string {
	if p := Override(); p != "" {
		return filepath.Join(p, "cache")
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(localAppData(), "cache")
	}
	if p := os.Getenv("XDG_CACHE_HOME"); p != "" {
		return filepath.Join(p, app)
	}
	return filepath.Join(homeDir(), ".cache", app)
}

// Log is the directory holding process logs.
func Log() string { return filepath.Join(Cache(), "log") }

// Tmp is the directory holding scratch files that may be deleted at any time.
func Tmp() string {
	if p := Override(); p != "" {
		return filepath.Join(p, "tmp")
	}
	return filepath.Join(os.TempDir(), app)
}

func localAppData() string {
	if p := os.Getenv("LOCALAPPDATA"); p != "" {
		return filepath.Join(p, app)
	}
	if base, err := os.UserCacheDir(); err == nil {
		return filepath.Join(base, app)
	}
	return filepath.Join(homeDir(), app)
}

func userConfigDir() string {
	if base, err := os.UserConfigDir(); err == nil {
		return base
	}
	return homeDir()
}

func homeDir() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return home
	}
	return os.TempDir()
}
