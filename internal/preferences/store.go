// Package preferences persists desktop-app preferences that are local to this
// machine. They apply immediately and never trigger a core restart.
package preferences

import (
	"database/sql"
	"encoding/json"
	"strings"
)

const (
	densityComfortable = "comfortable"
	densityCompact     = "compact"

	timelineFocused     = "focused"
	timelineComfortable = "comfortable"
	timelineWide        = "wide"

	organizeProjects = "projects"
	organizeList     = "list"

	themeSystem = "system"
	themeDark   = "dark"
	themeLight  = "light"

	languageEnglish = "en"
	languageChinese = "zh"
)

// Appearance controls the client look without changing core configuration.
type Appearance struct {
	Density         string         `json:"density"`
	TimelineWidth   string         `json:"timelineWidth"`
	Theme           string         `json:"theme"`
	Language        string         `json:"language"`
	SidebarOrganize string         `json:"sidebarOrganize"`
	TimelineDetail  TimelineDetail `json:"timelineDetail"`
}

// Selection names the last used provider and model.
type Selection struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

// Notifications chooses which session events raise a notification.
type Notifications struct {
	Agent       bool `json:"agent"`
	Permissions bool `json:"permissions"`
	Questions   bool `json:"questions"`
	Errors      bool `json:"errors"`
}

// Preferences is the persisted app-local settings document.
type Preferences struct {
	DefaultWorkspace       string                          `json:"defaultWorkspace"`
	WorkspaceDestination   string                          `json:"workspaceDestination"`
	AutoApprove            bool                            `json:"autoApprove"`
	FollowUpBehavior       string                          `json:"followUpBehavior"`
	ShowAgent              bool                            `json:"showAgent"`
	ShowMessageAgent       bool                            `json:"showMessageAgent"`
	Spellcheck             bool                            `json:"spellcheck"`
	FoldUserMessages       bool                            `json:"foldUserMessages"`
	ShowTurnDiffs          bool                            `json:"showTurnDiffs"`
	BackgroundActivity     string                          `json:"backgroundActivity"`
	NewIcons               bool                            `json:"newIcons"`
	NewQuestionUI          bool                            `json:"newQuestionUI"`
	Sounds                 Sounds                          `json:"sounds"`
	DefaultModel           Selection                       `json:"defaultModel"`
	ProjectNames           map[string]string               `json:"projectNames"`
	ProjectIcons           map[string]string               `json:"projectIcons"`
	ProjectColors          map[string]string               `json:"projectColors"`
	ProjectWorktreeStartup map[string]string               `json:"projectWorktreeStartup"`
	ProjectAutoApprove     map[string]bool                 `json:"projectAutoApprove"`
	ProviderAccounts       map[string][]ProviderCredential `json:"providerAccounts"`
	ActiveProviderAccounts map[string]string               `json:"activeProviderAccounts"`
	Favorites              []Selection                     `json:"favoriteModels"`
	Recent                 []Selection                     `json:"recentModels"`
	HiddenModels           []Selection                     `json:"hiddenModels"`
	Pinned                 []string                        `json:"pinnedSessions"`
	Appearance             Appearance                      `json:"appearance"`
	Notifications          Notifications                   `json:"notifications"`
	Keybinds               map[string]string               `json:"keybinds"`
}

// Sounds chooses which session events play a short sound.
type Sounds struct {
	Agent       bool              `json:"agent"`
	Permissions bool              `json:"permissions"`
	Questions   bool              `json:"questions"`
	Errors      bool              `json:"errors"`
	Interface   bool              `json:"interface"`
	Tones       map[string]string `json:"tones"`
}

// ProviderCredential is one named API-key credential for a provider.
type ProviderCredential struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Key  string `json:"key"`
}

// Default is the preference set used when no row exists or the row is
// unreadable.
func Default() Preferences {
	return Preferences{
		WorkspaceDestination: "last-used",
		FollowUpBehavior:     "steer",
		ShowAgent:            true,
		ShowMessageAgent:     false,
		Spellcheck:           true,
		FoldUserMessages:     true,
		ShowTurnDiffs:        true,
		BackgroundActivity:   "left",
		NewIcons:             false,
		NewQuestionUI:        false,
		Sounds: Sounds{
			Agent:       true,
			Permissions: true,
			Questions:   true,
			Errors:      true,
			Interface:   true,
			Tones:       map[string]string{},
		},
		Appearance: Appearance{
			Density:         densityComfortable,
			TimelineWidth:   timelineComfortable,
			Theme:           themeSystem,
			Language:        languageEnglish,
			SidebarOrganize: organizeList,
			TimelineDetail:  defaultTimelineDetail(),
		},
		Notifications: Notifications{
			// A finished run is the event a desktop notice exists for, so it is
			// on by default; the settings page still turns it off per channel.
			Agent:       true,
			Permissions: true,
			Questions:   true,
			Errors:      true,
		},
	}
}

type Store struct {
	db *sql.DB
}

// Open prepares the preferences table.
func Open(db *sql.DB) (*Store, error) {
	store := &Store{db: db}
	if err := store.ensure(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) ensure() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS preferences (
		id   INTEGER PRIMARY KEY CHECK (id = 1),
		data TEXT NOT NULL
	)`)
	return err
}

// Get returns the saved preferences; a missing or corrupt row falls back to
// defaults.
func (s *Store) Get() Preferences {
	var data string
	if err := s.db.QueryRow(`SELECT data FROM preferences WHERE id = 1`).Scan(&data); err != nil {
		return Default()
	}
	prefs := Default()
	if json.Unmarshal([]byte(data), &prefs) != nil {
		return Default()
	}
	return Normalize(prefs)
}

// Save stores the preference document in one row.
func (s *Store) Save(prefs Preferences) error {
	prefs = Normalize(prefs)
	data, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO preferences(id, data) VALUES(1, ?)
		 ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
		string(data),
	)
	return err
}

// Normalize clamps unknown values to the defaults so a hand-edited document can
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
	prefs.Favorites = normalizeSelections(prefs.Favorites, 50)
	prefs.Recent = normalizeSelections(prefs.Recent, 8)
	prefs.HiddenModels = normalizeSelections(prefs.HiddenModels, 1000)
	prefs.Pinned = normalizePinned(prefs.Pinned, 200)
	if prefs.ProjectNames == nil {
		prefs.ProjectNames = map[string]string{}
	}
	for path, name := range prefs.ProjectNames {
		value := strings.TrimSpace(name)
		if value == "" || strings.TrimSpace(path) == "" {
			delete(prefs.ProjectNames, path)
			continue
		}
		if len(value) > 128 {
			value = value[:128]
		}
		prefs.ProjectNames[path] = value
	}
	if prefs.ProjectAutoApprove == nil {
		prefs.ProjectAutoApprove = map[string]bool{}
	}
	prefs.ProjectIcons = normalizeStringMap(prefs.ProjectIcons, 64)
	prefs.ProjectColors = normalizeStringMap(prefs.ProjectColors, 32)
	prefs.ProjectWorktreeStartup = normalizeStringMap(prefs.ProjectWorktreeStartup, 512)
	prefs.ProviderAccounts = normalizeCredentialMap(prefs.ProviderAccounts)
	prefs.ActiveProviderAccounts = normalizeStringMap(prefs.ActiveProviderAccounts, 128)
	prefs.Sounds.Tones = normalizeStringMap(prefs.Sounds.Tones, 32)
	switch prefs.FollowUpBehavior {
	case "queue", "steer":
	default:
		prefs.FollowUpBehavior = defaults.FollowUpBehavior
	}
	switch prefs.WorkspaceDestination {
	case "local", "new":
	default:
		prefs.WorkspaceDestination = defaults.WorkspaceDestination
	}
	switch prefs.BackgroundActivity {
	case "off", "center", "right":
	default:
		prefs.BackgroundActivity = defaults.BackgroundActivity
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
	switch prefs.Appearance.Theme {
	case themeSystem, themeDark, themeLight:
	default:
		prefs.Appearance.Theme = defaults.Appearance.Theme
	}
	switch prefs.Appearance.Language {
	case languageEnglish, languageChinese:
	default:
		prefs.Appearance.Language = defaults.Appearance.Language
	}
	switch prefs.Appearance.SidebarOrganize {
	case organizeProjects, organizeList:
	default:
		prefs.Appearance.SidebarOrganize = defaults.Appearance.SidebarOrganize
	}
	prefs.Appearance.TimelineDetail = normalizeTimelineDetail(
		prefs.Appearance.TimelineDetail,
		defaults.Appearance.TimelineDetail,
	)
	prefs.Keybinds = normalizeKeybinds(prefs.Keybinds)
	return prefs
}

func normalizePinned(items []string, limit int) []string {
	out := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
		if len(out) == limit {
			break
		}
	}
	return out
}

func normalizeSelections(items []Selection, limit int) []Selection {
	out := make([]Selection, 0, len(items))
	seen := map[Selection]bool{}
	for _, item := range items {
		item.Provider = strings.TrimSpace(item.Provider)
		item.Model = strings.TrimSpace(item.Model)
		if item.Provider == "" || item.Model == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
		if len(out) == limit {
			break
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeKeybinds(items map[string]string) map[string]string {
	if len(items) == 0 {
		return nil
	}
	out := make(map[string]string, len(items))
	for action, value := range items {
		action = strings.TrimSpace(action)
		value = strings.TrimSpace(value)
		if action == "" || value == "" || len(value) > 64 {
			continue
		}
		out[action] = value
		if len(out) == 100 {
			break
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeStringMap(value map[string]string, limit int) map[string]string {
	out := map[string]string{}
	for path, item := range value {
		key := strings.TrimSpace(path)
		text := strings.TrimSpace(item)
		if key == "" || text == "" {
			continue
		}
		if len(text) > limit {
			text = text[:limit]
		}
		out[key] = text
	}
	return out
}

func normalizeCredentialMap(value map[string][]ProviderCredential) map[string][]ProviderCredential {
	out := map[string][]ProviderCredential{}
	for provider, list := range value {
		key := strings.TrimSpace(provider)
		if key == "" {
			continue
		}
		seen := map[string]bool{}
		for _, credential := range list {
			id := strings.TrimSpace(credential.ID)
			if id == "" || seen[id] || len(out[key]) >= 20 {
				continue
			}
			seen[id] = true
			name := strings.TrimSpace(credential.Name)
			if name == "" {
				name = id
			}
			if len(name) > 128 {
				name = name[:128]
			}
			out[key] = append(out[key], ProviderCredential{ID: id, Name: name, Key: credential.Key})
		}
	}
	return out
}
