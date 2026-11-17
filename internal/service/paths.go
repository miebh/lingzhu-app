package service

import (
	"encoding/json"
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

// dataDir returns where one workspace's session database lives. The core keeps
// every project in one store under baseData.
func (s *CoreService) dataDir(_ string) string {
	return s.baseData
}
