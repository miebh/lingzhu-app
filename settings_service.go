package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"lingzhu-app/internal/global"
	"lingzhu-app/internal/preferences"
	"lingzhu-app/internal/version"
)

// Settings returns the editable subset of the shared config file. Providers
// pointing at the local magpie gateway get its current model labels without
// writing the file, so existing configs follow the gateway's catalog.
func (s *CoreService) Settings() (AppSettings, error) {
	file, err := s.readConfigFile()
	if err != nil {
		return AppSettings{}, err
	}
	settings := buildAppSettings(s.configFilePath(), file)
	enrichMagpieModels(&settings, file)
	enrichCatalogModels(&settings)
	return settings, nil
}

// SaveSettings validates and writes the shared config file, then restarts the
// workspace cores so every workspace picks it up. It returns the workspaces
// whose core was left alone because this app does not own the process.
func (s *CoreService) SaveSettings(input SettingsInput) ([]string, error) {
	if err := validateSettingsInput(input); err != nil {
		return nil, err
	}

	s.mu.Lock()
	busy := len(s.streams) > 0
	s.mu.Unlock()
	if busy {
		return nil, errors.New("stop running sessions before changing settings")
	}

	s.configMu.Lock()
	file, err := s.readConfigFile()
	if err != nil {
		s.configMu.Unlock()
		return nil, err
	}
	applySettingsInput(file, input)

	path := s.configFilePath()
	err = writeConfigFile(path, file)
	s.configMu.Unlock()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.configPath = path
	s.mu.Unlock()

	return s.restartWorkspaces(), nil
}

// SaveModelVisibility persists which models appear in the picker. The core
// ignores this presentation-only field, so the change never restarts a core and
// stays available while a session is running.
func (s *CoreService) SaveModelVisibility(entries []ModelVisibility) error {
	if len(entries) == 0 {
		return nil
	}
	s.configMu.Lock()
	defer s.configMu.Unlock()

	file, err := s.readConfigFile()
	if err != nil {
		return err
	}

	// A legacy config has no providers block. Promote it first so visibility
	// has somewhere to live; the running core never reads this flag, so the
	// migration does not need a restart.
	if _, ok := file["providers"]; !ok {
		settings := buildAppSettings("", file)
		input := settingsInputFromSettings(settings)
		applyModelVisibilityInput(&input, entries)
		applySettingsInput(file, input)
		return writeConfigFile(s.configFilePath(), file)
	}

	if !applyModelVisibility(file, entries) {
		return nil
	}
	return writeConfigFile(s.configFilePath(), file)
}

// Preferences returns the local app preferences; it never touches core config.
func (s *CoreService) Preferences() AppPreferences {
	prefs := preferences.Default()
	if s.prefs != nil {
		prefs = s.prefs.Get()
	}
	return AppPreferences{
		DefaultWorkspace: prefs.DefaultWorkspace,
		AutoApprove:      prefs.AutoApprove,
		DefaultModel:     ModelSelection{Provider: prefs.DefaultModel.Provider, Model: prefs.DefaultModel.Model},
		FavoriteModels:   appSelections(prefs.Favorites),
		RecentModels:     appSelections(prefs.Recent),
		Appearance: AppearancePreferences{
			FontFamily:    prefs.Appearance.FontFamily,
			Density:       prefs.Appearance.Density,
			TimelineWidth: prefs.Appearance.TimelineWidth,
			ReduceMotion:  prefs.Appearance.ReduceMotion,
		},
	}
}

// SavePreferences stores local preferences. Changes apply to the webview
// immediately and never restart a core.
func (s *CoreService) SavePreferences(input AppPreferences) error {
	if s.prefs == nil {
		return errors.New("preferences are unavailable")
	}
	return s.prefs.Save(preferences.Preferences{
		DefaultWorkspace: strings.TrimSpace(input.DefaultWorkspace),
		AutoApprove:      input.AutoApprove,
		DefaultModel: preferences.Selection{
			Provider: input.DefaultModel.Provider,
			Model:    input.DefaultModel.Model,
		},
		Favorites: prefSelections(input.FavoriteModels),
		Recent:    prefSelections(input.RecentModels),
		Appearance: preferences.Appearance{
			FontFamily:    input.Appearance.FontFamily,
			Density:       input.Appearance.Density,
			TimelineWidth: input.Appearance.TimelineWidth,
			ReduceMotion:  input.Appearance.ReduceMotion,
		},
	})
}

// Info returns the read-only diagnostics shown on the About page.
func (s *CoreService) Info() AppInfo {
	buildVersion := version.Version
	if buildVersion == "0.1.0-dev" {
		if build, ok := debug.ReadBuildInfo(); ok && build.Main.Version != "" && build.Main.Version != "(devel)" {
			buildVersion = build.Main.Version
		}
	}
	databasePath := s.appDBPath
	if databasePath == "" {
		databasePath = filepath.Join(localAppDir(), "app.db")
	}
	built := ""
	if exe, err := os.Executable(); err == nil {
		if stat, err := os.Stat(exe); err == nil {
			built = stat.ModTime().Format("2006-01-02 15:04")
		}
	}
	return AppInfo{
		Version:      buildVersion,
		Built:        built,
		ConfigPath:   s.configFilePath(),
		DatabasePath: databasePath,
		AppDataDir:   localAppDir(),
		DataDir:      s.baseData,
		LogPath:      filepath.Join(localCacheDir(), "core.log"),
	}
}

// localAppDir is the per-user directory that holds the app database, matching
// the path package appdb writes to.
func localAppDir() string { return global.AppData() }

// localCacheDir holds the core log, matching internal/core's log location.
func localCacheDir() string { return global.Log() }

// restartWorkspaces stops and starts every core this app owns. Reused cores
// keep running and are reported so the UI can ask the user to restart them.
func (s *CoreService) restartWorkspaces() []string {
	s.mu.Lock()
	paths := append([]string(nil), s.order...)
	s.mu.Unlock()

	reused := make([]string, 0)
	for _, path := range paths {
		s.mu.Lock()
		runtime := s.spaces[path]
		s.mu.Unlock()
		if runtime == nil {
			continue
		}
		if runtime.Core != nil && !runtime.Core.Owned {
			reused = append(reused, runtime.Name)
			continue
		}
		if runtime.Core != nil {
			s.stopFeed(path)
			ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
			_ = runtime.Core.Stop(ctx)
			cancel()
		}
		s.mu.Lock()
		runtime.Core = nil
		runtime.Addr = ""
		runtime.Err = ""
		s.mu.Unlock()
		if err := s.startCore(runtime); err != nil {
			s.mu.Lock()
			runtime.Err = err.Error()
			s.mu.Unlock()
		}
	}
	return reused
}

// configFilePath returns the file the settings dialog edits. Without a
// discovered config, the user config file is the one new cores load, so a
// machine-wide install never writes into the install directory.
func (s *CoreService) configFilePath() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.configPath != "" {
		return s.configPath
	}
	return filepath.Join(global.Config(), "config.json")
}

func (s *CoreService) readConfigFile() (document, error) {
	path := s.configFilePath()
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return document{}, nil
	}
	if err != nil {
		return nil, err
	}
	file := document{}
	if strings.TrimSpace(string(data)) == "" {
		return file, nil
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	return file, nil
}

// writeConfigFile replaces the file through a temp file so a failed write never
// leaves a half-written config behind.
func writeConfigFile(path string, file document) error {
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func appSelections(items []preferences.Selection) []ModelSelection {
	out := make([]ModelSelection, 0, len(items))
	for _, item := range items {
		out = append(out, ModelSelection{Provider: item.Provider, Model: item.Model})
	}
	return out
}

func prefSelections(items []ModelSelection) []preferences.Selection {
	if len(items) == 0 {
		return nil
	}
	out := make([]preferences.Selection, 0, len(items))
	for _, item := range items {
		out = append(out, preferences.Selection{Provider: item.Provider, Model: item.Model})
	}
	return out
}
