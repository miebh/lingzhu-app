// Package workspaces persists the directories the desktop app treats as
// workspaces.
package workspaces

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const migratedKey = "workspaces.migrated"

// Workspace is one directory the user added.
type Workspace struct {
	Path  string    `json:"path"`
	Added time.Time `json:"added"`
}

type Store struct {
	db  *sql.DB
	dir string
}

// Open prepares the workspace table and imports the legacy JSON list once.
// dir is the app data directory that may still contain workspaces.json.
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
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS workspaces (
		path     TEXT PRIMARY KEY,
		added    INTEGER NOT NULL,
		position INTEGER NOT NULL
	)`); err != nil {
		return err
	}
	return s.migrate()
}

// migrate imports workspaces.json in its original order. The JSON file stays
// on disk as a backup; the database is the source of truth after this runs.
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
	if err := tx.QueryRow(`SELECT COUNT(*) FROM workspaces`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		data, err := os.ReadFile(filepath.Join(s.dir, "workspaces.json"))
		if err == nil {
			var list []Workspace
			if err := json.Unmarshal(data, &list); err != nil {
				return fmt.Errorf("workspaces.json: %w", err)
			}
			for index, item := range list {
				path := strings.TrimSpace(item.Path)
				if path == "" {
					continue
				}
				added := item.Added.UnixMilli()
				if item.Added.IsZero() {
					added = time.Now().UTC().UnixMilli()
				}
				if _, err := tx.Exec(
					`INSERT OR IGNORE INTO workspaces(path, added, position) VALUES(?, ?, ?)`,
					path, added, index,
				); err != nil {
					return err
				}
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	if _, err := tx.Exec(
		`INSERT OR REPLACE INTO meta(key, value) VALUES(?, '1')`, migratedKey,
	); err != nil {
		return err
	}
	return tx.Commit()
}

// List returns the saved workspaces in insertion order.
func (s *Store) List() ([]Workspace, error) {
	rows, err := s.db.Query(`SELECT path, added FROM workspaces ORDER BY position, path`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Workspace
	for rows.Next() {
		var (
			item  Workspace
			added int64
		)
		if err := rows.Scan(&item.Path, &added); err != nil {
			return nil, err
		}
		item.Added = time.UnixMilli(added).UTC()
		list = append(list, item)
	}
	return list, rows.Err()
}

// Add appends a path unless it is already present. It returns the full list.
func (s *Store) Add(path string) ([]Workspace, error) {
	if _, err := s.db.Exec(
		`INSERT OR IGNORE INTO workspaces(path, added, position)
		 VALUES(?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM workspaces))`,
		path, time.Now().UTC().UnixMilli(),
	); err != nil {
		return nil, err
	}
	return s.List()
}

// Remove drops a path from the list and returns the remaining workspaces.
func (s *Store) Remove(path string) ([]Workspace, error) {
	if _, err := s.db.Exec(`DELETE FROM workspaces WHERE path = ?`, path); err != nil {
		return nil, err
	}
	return s.List()
}

func metaHas(db *sql.DB, key string) (bool, error) {
	var value string
	err := db.QueryRow(`SELECT value FROM meta WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
