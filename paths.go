package main

import (
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"lingzhu-app/internal/global"
)

// discoverConfig returns the core config the app should edit: LINGZHU_CONFIG,
// then a project lingzhu.json beside the working directory, then the user
// config file. It never looks for a build directory.
func discoverConfig() string {
	if path := os.Getenv("LINGZHU_CONFIG"); path != "" {
		return path
	}
	dir, err := os.Getwd()
	if err != nil {
		return filepath.Join(global.Config(), "config.json")
	}
	for depth := 0; depth < 5; depth++ {
		path := filepath.Join(dir, "lingzhu.json")
		if _, err := os.Stat(path); err == nil {
			abs, _ := filepath.Abs(path)
			return abs
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return filepath.Join(global.Config(), "config.json")
}

// discoverWorkdir treats the directory holding a project config as the project
// root; the user config file has no project, so the working directory wins.
func discoverWorkdir(configPath string) string {
	if configPath == "" {
		return ""
	}
	dir := filepath.Dir(configPath)
	if strings.EqualFold(dir, global.Config()) {
		return ""
	}
	return dir
}

// resolveBaseData mirrors the core's data_dir resolution: an explicit data_dir
// in the config resolves next to the config file, otherwise the user data
// directory is used.
func resolveBaseData(configPath string) string {
	if configPath != "" {
		if data, err := os.ReadFile(configPath); err == nil {
			var file struct {
				DataDir string `json:"data_dir"`
			}
			if json.Unmarshal(data, &file) == nil && file.DataDir != "" {
				return filepath.Join(filepath.Dir(configPath), file.DataDir)
			}
		}
	}
	return global.Data()
}

// dataDir keeps the default workspace on the shared data directory so existing
// history stays visible; every other workspace gets its own subdirectory.
func (s *CoreService) dataDir(path string) string {
	if path == s.defaultRoot {
		return s.baseData
	}
	sum := sha1.Sum([]byte(strings.ToLower(path)))
	slug := slugify(filepath.Base(path))
	return filepath.Join(s.baseData, "workspaces", fmt.Sprintf("%s-%x", slug, sum[:4]))
}

func slugify(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.':
			b.WriteRune('-')
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		return "workspace"
	}
	if len(slug) > 24 {
		slug = slug[:24]
	}
	return slug
}
