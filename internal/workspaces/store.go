// Package workspaces persists the directories the desktop app treats as
// workspaces.
package workspaces

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// Workspace is one directory the user added.
type Workspace struct {
	Path  string    `json:"path"`
	Added time.Time `json:"added"`
}

type Store struct {
	path string
}

// Open loads the workspace list from the user config directory.
func Open() (*Store, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "lingzhu", "app")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{path: filepath.Join(dir, "workspaces.json")}, nil
}

// List returns the saved workspaces in insertion order.
func (s *Store) List() ([]Workspace, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var list []Workspace
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

// Add appends a path unless it is already present. It returns the full list.
func (s *Store) Add(path string) ([]Workspace, error) {
	list, err := s.List()
	if err != nil {
		return nil, err
	}
	for _, item := range list {
		if item.Path == path {
			return list, nil
		}
	}
	list = append(list, Workspace{Path: path, Added: time.Now().UTC()})
	return list, s.save(list)
}

// Remove drops a path from the list and returns the remaining workspaces.
func (s *Store) Remove(path string) ([]Workspace, error) {
	list, err := s.List()
	if err != nil {
		return nil, err
	}
	out := list[:0]
	for _, item := range list {
		if item.Path != path {
			out = append(out, item)
		}
	}
	return out, s.save(out)
}

func (s *Store) save(list []Workspace) error {
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}
