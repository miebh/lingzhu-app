// Package preferences persists desktop-app preferences that are local to this
// machine. They apply immediately and never trigger a core restart.
package preferences

import (
	"database/sql"
	"encoding/json"
	"errors"
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

	migratedKey = "preferences.migrated"
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

// Default is the preference set used when no row exists or the row is
// unreadable.
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
	db  *sql.DB
	dir string
}

// Open prepares the preferences table and imports the legacy JSON document
// once. dir is the app data directory that may still contain preferences.json.
func Open(db *sql.DB, dir string) (*Store, error) {
	store := &Store{db: db, dir: dir}
	if err := store.ensure(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) ensure() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS meta (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`); err != nil {
		return err
	}
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS preferences (
		id   INTEGER PRIMARY KEY CHECK (id = 1),
		data TEXT NOT NULL
	)`); err != nil {
		return err
	}
	return s.migrate()
}

// migrate imports preferences.json into the new table. The JSON file stays on
// disk as a backup; the database is the source of truth after this runs.
func (s *Store) migrate() error {
	migrated, err := metaHas(s.db, migratedKey)
	if err != nil || migrated {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var count int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM preferences`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		data, err := os.ReadFile(filepath.Join(s.dir, "preferences.json"))
		if err == nil {
			var prefs Preferences
			if json.Unmarshal(data, &prefs) == nil {
				prefs = Normalize(prefs)
				raw, err := json.Marshal(prefs)
				if err != nil {
					return err
				}
				if _, err := tx.Exec(`INSERT OR IGNORE INTO preferences(id, data) VALUES(1, ?)`, string(raw)); err != nil {
					return err
				}
			}
		}
	}
	if _, err := tx.Exec(
		`INSERT OR REPLACE INTO meta(key, value) VALUES(?, '1')`, migratedKey,
	); err != nil {
		return err
	}
	return tx.Commit()
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

func metaHas(db *sql.DB, key string) (bool, error) {
	var value string
	err := db.QueryRow(`SELECT value FROM meta WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
