// Package preferences persists desktop-app preferences that are local to this
// machine. They apply immediately and never trigger a core restart.
package preferences

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

const (
	densityComfortable = "comfortable"
	densityCompact     = "compact"

	timelineFocused     = "focused"
	timelineComfortable = "comfortable"
	timelineWide        = "wide"

	motionSystem = "system"
	motionOn     = "on"
	motionOff    = "off"
)

// Appearance controls the client look without changing core configuration.
type Appearance struct {
	FontFamily    string `json:"fontFamily"`
	Density       string `json:"density"`
	TimelineWidth string `json:"timelineWidth"`
	ReduceMotion  string `json:"reduceMotion"`
}

// Selection names the last used provider and model.
type Selection struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

// Preferences is the persisted app-local settings document.
type Preferences struct {
	DefaultWorkspace string     `json:"defaultWorkspace"`
	AutoApprove      bool       `json:"autoApprove"`
	DefaultModel     Selection  `json:"defaultModel"`
	Appearance       Appearance `json:"appearance"`
}

// Default is the preference set used when the file is missing or unreadable.
func Default() Preferences {
	return Preferences{
		Appearance: Appearance{
			FontFamily:    "",
			Density:       densityComfortable,
			TimelineWidth: timelineComfortable,
			ReduceMotion:  motionSystem,
		},
	}
}

type Store struct {
	path string
}

// Open resolves the preference file under the user config directory.
func Open() (*Store, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "lingzhu", "app")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{path: filepath.Join(dir, "preferences.json")}, nil
}

func (s *Store) Path() string {
	return s.path
}

// Get returns the saved preferences; a corrupt file falls back to defaults.
func (s *Store) Get() Preferences {
	prefs := Default()
	data, err := os.ReadFile(s.path)
	if err != nil {
		return prefs
	}
	if err := json.Unmarshal(data, &prefs); err != nil {
		return Default()
	}
	return Normalize(prefs)
}

// Save writes the preferences through a temp file so a failed write cannot
// leave a half-written document behind.
func (s *Store) Save(prefs Preferences) error {
	prefs = Normalize(prefs)
	data, err := json.MarshalIndent(prefs, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// Normalize clamps unknown values to the defaults so a hand-edited file can
// never inject a value the UI does not know.
func Normalize(prefs Preferences) Preferences {
	defaults := Default()
	prefs.DefaultWorkspace = strings.TrimSpace(prefs.DefaultWorkspace)
	prefs.DefaultModel.Provider = strings.TrimSpace(prefs.DefaultModel.Provider)
	prefs.DefaultModel.Model = strings.TrimSpace(prefs.DefaultModel.Model)
	// A half-filled selection is unusable; drop both halves together.
	if prefs.DefaultModel.Provider == "" || prefs.DefaultModel.Model == "" {
		prefs.DefaultModel = Selection{}
	}
	prefs.Appearance.FontFamily = strings.TrimSpace(prefs.Appearance.FontFamily)
	if len(prefs.Appearance.FontFamily) > 256 {
		prefs.Appearance.FontFamily = prefs.Appearance.FontFamily[:256]
	}
	switch prefs.Appearance.Density {
	case densityCompact, densityComfortable:
	default:
		prefs.Appearance.Density = defaults.Appearance.Density
	}
	switch prefs.Appearance.TimelineWidth {
	case timelineFocused, timelineComfortable, timelineWide:
	default:
		prefs.Appearance.TimelineWidth = defaults.Appearance.TimelineWidth
	}
	switch prefs.Appearance.ReduceMotion {
	case motionSystem, motionOn, motionOff:
	default:
		prefs.Appearance.ReduceMotion = defaults.Appearance.ReduceMotion
	}
	return prefs
}
