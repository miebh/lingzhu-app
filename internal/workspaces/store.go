// Package workspaces persists the directories the desktop app treats as
// workspaces.
package workspaces

import (
	"database/sql"
	"time"
)

// Workspace is one directory the user added.
type Workspace struct {
	Path  string    `json:"path"`
	Added time.Time `json:"added"`
}

type Store struct {
	db *sql.DB
}

// Open prepares the workspace table.
func Open(db *sql.DB) (*Store, error) {
	store := &Store{db: db}
	if err := store.ensure(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) ensure() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS workspaces (
		path     TEXT PRIMARY KEY,
		added    INTEGER NOT NULL,
		position INTEGER NOT NULL
	)`)
	return err
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
