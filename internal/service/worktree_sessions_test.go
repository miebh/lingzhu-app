package service

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestWorktreeSessionsCountsByPlacement(t *testing.T) {
	base := t.TempDir()
	service := &CoreService{baseData: base}
	opened := filepath.Join(t.TempDir(), "opened")
	unopened := filepath.Join(t.TempDir(), "unopened")

	// One core keeps every project in one store, so the count comes from the
	// session's recorded placement rather than from a per-workspace database.
	dir := filepath.Join(base, "sessions")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "sessions.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', directory TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL);
CREATE TABLE events (session_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (session_id, seq));`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO sessions(id, directory, updated) VALUES('s1', ?, 1);
INSERT INTO events(session_id, seq, type, at, data) VALUES('s1', 1, 'user.message', 1, '{}');`, opened); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	counts := service.WorktreeSessions([]string{opened, unopened})
	if counts[opened] != 1 {
		t.Fatalf("opened worktree count = %d, want 1", counts[opened])
	}
	if counts[unopened] != 0 {
		t.Fatalf("unopened worktree count = %d, want 0", counts[unopened])
	}
}

func TestWorktreeSessionsReadsLegacyStore(t *testing.T) {
	base := t.TempDir()
	service := &CoreService{baseData: base}
	project := filepath.Join(t.TempDir(), "legacy")

	if legacy := service.legacyDataDir(project); legacy != "" {
		t.Fatalf("a fresh workspace must have no legacy directory, got %q", legacy)
	}
	// A directory left by a previous release still resolves, so an upgrade keeps
	// reading the history that release wrote.
	dir := filepath.Join(service.legacyPath(project), "sessions")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if legacy := service.legacyDataDir(project); legacy == "" {
		t.Fatal("a directory written by a previous release must be found")
	}
	if got := service.dataDir(project); got != service.legacyDataDir(project) {
		t.Fatalf("dataDir must prefer the legacy directory, got %q", got)
	}
}
