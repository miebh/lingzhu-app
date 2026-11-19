package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"

	"lingzhu-app/internal/global"
	"lingzhu-app/internal/preferences"
	"lingzhu-app/internal/version"
)

// ConfigFile is the raw app configuration file shown by the client.
type ConfigFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// ReadConfigFile returns the raw configuration file for a read-only viewer.
func (s *CoreService) ReadConfigFile() (ConfigFile, error) {
	s.configMu.Lock()
	defer s.configMu.Unlock()
	path := s.configFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ConfigFile{Path: path}, nil
		}
		return ConfigFile{}, err
	}
	return ConfigFile{Path: path, Content: string(data)}, nil
}

// syncGatewayConfig reconciles gateway-backed providers once before cores
// start, so the first prompt resolves the gateway's current models.
func (s *CoreService) syncGatewayConfig() {
	_, _ = s.refreshGatewayConfig(false, false)
}

// refreshGatewayConfig reconciles gateway-backed providers with the models the
// local gateway advertises and writes a changed list. It reports the document
// it worked on and whether the file changed. The read, the fetch and the write
// share the config lock, so a settings save cannot interleave with it.
func (s *CoreService) refreshGatewayConfig(force bool, restart bool) (document, bool) {
	s.configMu.Lock()
	file, err := s.readConfigFile()
	if err != nil || len(file) == 0 {
		s.configMu.Unlock()
		return file, false
	}
	if !syncGatewayModels(file, force) {
		s.configMu.Unlock()
		return file, false
	}
	err = writeConfigFile(s.configFilePath(), file)
	s.configMu.Unlock()
	if err != nil {
		fmt.Printf("sync gateway models: %v\n", err)
		return file, false
	}
	if !restart {
		return file, true
	}
	s.mu.Lock()
	busy := len(s.streams) > 0
	s.mu.Unlock()
	if busy {
		return file, true
	}
	go func() {
		s.restartWorkspaces()
	}()
	return file, true
}

// Settings returns the editable subset of the shared config file. It is a pure
// read: gateway-backed providers follow magpie's catalog in the projection, but
// the file is not rewritten and no core is restarted, so a painter or a dialog
// can call it freely.
func (s *CoreService) Settings() (AppSettings, error) {
	file, err := s.readConfigFile()
	if err != nil {
		return AppSettings{}, err
	}
	return s.projectSettings(file), nil
}

// projectSettings renders a config document as the client sees it. Catalog
// enrichment only adds metadata the file omits; it never changes availability.
func (s *CoreService) projectSettings(file document) AppSettings {
	settings := buildAppSettings(s.configFilePath(), file)
	enrichMagpieModels(&settings, file, false)
	enrichCatalogModels(&settings)
	return settings
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

// Preferences returns the local app preferences; it never touches core config.
func (s *CoreService) Preferences() AppPreferences {
	prefs := preferences.Default()
	if s.prefs != nil {
		prefs = s.prefs.Get()
	}
	return AppPreferences{
		DefaultWorkspace:     prefs.DefaultWorkspace,
		WorkspaceDestination: prefs.WorkspaceDestination,
		AutoApprove:          prefs.AutoApprove,
		FollowUpBehavior:     prefs.FollowUpBehavior,
		ShowAgent:            prefs.ShowAgent,
		ShowMessageAgent:     prefs.ShowMessageAgent,
		Spellcheck:           prefs.Spellcheck,
		FoldUserMessages:     prefs.FoldUserMessages,
		ShowTurnDiffs:        prefs.ShowTurnDiffs,
		BackgroundActivity:   prefs.BackgroundActivity,
		PinchZoom:            prefs.PinchZoom,
		NewIcons:             prefs.NewIcons,
		NewQuestionUI:        prefs.NewQuestionUI,
		Sounds: SoundPreferences{
			Agent:       prefs.Sounds.Agent,
			Permissions: prefs.Sounds.Permissions,
			Questions:   prefs.Sounds.Questions,
			Errors:      prefs.Sounds.Errors,
			Interface:   prefs.Sounds.Interface,
			Tones:       prefs.Sounds.Tones,
		},
		DefaultModel:           ModelSelection{Provider: prefs.DefaultModel.Provider, Model: prefs.DefaultModel.Model},
		ProjectNames:           prefs.ProjectNames,
		ProjectIcons:           prefs.ProjectIcons,
		ProjectColors:          prefs.ProjectColors,
		ProjectWorktreeStartup: prefs.ProjectWorktreeStartup,
		ProjectAutoApprove:     prefs.ProjectAutoApprove,
		ProviderAccounts:       appProviderAccounts(prefs.ProviderAccounts),
		ActiveProviderAccounts: prefs.ActiveProviderAccounts,
		FavoriteModels:         appSelections(prefs.Favorites),
		RecentModels:           appSelections(prefs.Recent),
		HiddenModels:           appSelections(prefs.HiddenModels),
		PinnedSessions:         append([]string{}, prefs.Pinned...),
		Appearance: AppearancePreferences{
			FontFamily:      prefs.Appearance.FontFamily,
			CodeFont:        prefs.Appearance.CodeFont,
			TerminalFont:    prefs.Appearance.TerminalFont,
			ThemeName:       prefs.Appearance.ThemeName,
			Density:         prefs.Appearance.Density,
			Zoom:            prefs.Appearance.Zoom,
			TimelineWidth:   prefs.Appearance.TimelineWidth,
			ReduceMotion:    prefs.Appearance.ReduceMotion,
			Theme:           prefs.Appearance.Theme,
			Language:        prefs.Appearance.Language,
			TabLayout:       prefs.Appearance.TabLayout,
			SidebarOrganize: prefs.Appearance.SidebarOrganize,
			TimelineDetail:  prefs.Appearance.TimelineDetail,
		},
		Notifications: NotificationPreferences{
			Agent:       prefs.Notifications.Agent,
			Permissions: prefs.Notifications.Permissions,
			Questions:   prefs.Notifications.Questions,
			Errors:      prefs.Notifications.Errors,
		},
		Keybinds: prefKeybinds(prefs.Keybinds),
	}
}

// SavePreferences stores local preferences. Changes apply to the webview
// immediately and never restart a core.
func (s *CoreService) SavePreferences(input AppPreferences) error {
	if s.prefs == nil {
		return errors.New("preferences are unavailable")
	}
	return s.prefs.Save(preferences.Preferences{
		DefaultWorkspace:     strings.TrimSpace(input.DefaultWorkspace),
		WorkspaceDestination: input.WorkspaceDestination,
		AutoApprove:          input.AutoApprove,
		FollowUpBehavior:     input.FollowUpBehavior,
		ShowAgent:            input.ShowAgent,
		ShowMessageAgent:     input.ShowMessageAgent,
		Spellcheck:           input.Spellcheck,
		FoldUserMessages:     input.FoldUserMessages,
		ShowTurnDiffs:        input.ShowTurnDiffs,
		BackgroundActivity:   input.BackgroundActivity,
		PinchZoom:            input.PinchZoom,
		NewIcons:             input.NewIcons,
		NewQuestionUI:        input.NewQuestionUI,
		Sounds: preferences.Sounds{
			Agent:       input.Sounds.Agent,
			Permissions: input.Sounds.Permissions,
			Questions:   input.Sounds.Questions,
			Errors:      input.Sounds.Errors,
			Interface:   input.Sounds.Interface,
			Tones:       input.Sounds.Tones,
		},
		DefaultModel: preferences.Selection{
			Provider: input.DefaultModel.Provider,
			Model:    input.DefaultModel.Model,
		},
		ProjectNames:           input.ProjectNames,
		ProjectIcons:           input.ProjectIcons,
		ProjectColors:          input.ProjectColors,
		ProjectWorktreeStartup: input.ProjectWorktreeStartup,
		ProjectAutoApprove:     input.ProjectAutoApprove,
		ProviderAccounts:       prefProviderAccounts(input.ProviderAccounts),
		ActiveProviderAccounts: input.ActiveProviderAccounts,
		Favorites:              prefSelections(input.FavoriteModels),
		Recent:                 prefSelections(input.RecentModels),
		HiddenModels:           prefSelections(input.HiddenModels),
		Pinned:                 append([]string{}, input.PinnedSessions...),
		Appearance: preferences.Appearance{
			FontFamily:      input.Appearance.FontFamily,
			CodeFont:        input.Appearance.CodeFont,
			TerminalFont:    input.Appearance.TerminalFont,
			ThemeName:       input.Appearance.ThemeName,
			Density:         input.Appearance.Density,
			Zoom:            input.Appearance.Zoom,
			TimelineWidth:   input.Appearance.TimelineWidth,
			ReduceMotion:    input.Appearance.ReduceMotion,
			Theme:           input.Appearance.Theme,
			Language:        input.Appearance.Language,
			TabLayout:       input.Appearance.TabLayout,
			SidebarOrganize: input.Appearance.SidebarOrganize,
			TimelineDetail:  input.Appearance.TimelineDetail,
		},
		Notifications: preferences.Notifications{
			Agent:       input.Notifications.Agent,
			Permissions: input.Notifications.Permissions,
			Questions:   input.Notifications.Questions,
			Errors:      input.Notifications.Errors,
		},
		Keybinds: prefKeybinds(input.Keybinds),
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

// restartWorkspaces stops and starts the core this app owns. Reused cores keep
// running and are reported so the UI can ask the user to restart them. One
// process serves every workspace, so this restarts them all together.
func (s *CoreService) restartWorkspaces() []string {
	s.mu.Lock()
	shared := s.core
	paths := append([]string(nil), s.order...)
	s.mu.Unlock()

	if shared != nil && !shared.Owned {
		reused := make([]string, 0, len(paths))
		for _, path := range paths {
			s.mu.Lock()
			runtime := s.spaces[path]
			s.mu.Unlock()
			if runtime != nil {
				reused = append(reused, runtime.Name)
			}
		}
		return reused
	}
	_ = s.restartSharedCore()
	return nil
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
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
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

// prefKeybinds copies the keybind map so a later UI mutation cannot rewrite
// the stored document in place.
func prefKeybinds(items map[string]string) map[string]string {
	if len(items) == 0 {
		return nil
	}
	out := make(map[string]string, len(items))
	for action, binding := range items {
		out[action] = binding
	}
	return out
}

func appProviderAccounts(value map[string][]preferences.ProviderCredential) map[string][]ProviderCredential {
	out := make(map[string][]ProviderCredential, len(value))
	for provider, list := range value {
		credentials := make([]ProviderCredential, 0, len(list))
		for _, item := range list {
			credentials = append(credentials, ProviderCredential{ID: item.ID, Name: item.Name, Key: item.Key})
		}
		out[provider] = credentials
	}
	return out
}

func prefProviderAccounts(value map[string][]ProviderCredential) map[string][]preferences.ProviderCredential {
	out := make(map[string][]preferences.ProviderCredential, len(value))
	for provider, list := range value {
		credentials := make([]preferences.ProviderCredential, 0, len(list))
		for _, item := range list {
			credentials = append(credentials, preferences.ProviderCredential{ID: item.ID, Name: item.Name, Key: item.Key})
		}
		out[provider] = credentials
	}
	return out
}
