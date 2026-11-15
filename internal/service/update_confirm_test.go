package service

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestConfirmUpdateWritesMarkerWhenPending proves the app only confirms a build
// the installer is actually waiting on: a normal launch must not touch update
// state.
func TestConfirmUpdateWritesMarkerWhenPending(t *testing.T) {
	t.Setenv("LINGZHU_HOME", t.TempDir())

	if err := confirmUpdate(); err != nil {
		t.Fatalf("confirm without a pending update must be a no-op: %v", err)
	}
	if _, err := os.Stat(filepath.Join(updateDir(), updateConfirmedName)); !os.IsNotExist(err) {
		t.Fatal("confirmed marker written without a pending update")
	}

	if err := os.MkdirAll(updateDir(), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(updateDir(), updatePendingName), []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := confirmUpdate(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(updateDir(), updateConfirmedName)); err != nil {
		t.Fatalf("confirmed marker missing after a pending update: %v", err)
	}
}

// TestClearStaleUpdateStateRemovesAbandonedMarkers proves a marker left behind
// by an update whose watchdog never ran is dropped, so a healthy build is not
// re-confirmed on every launch forever.
func TestClearStaleUpdateStateRemovesAbandonedMarkers(t *testing.T) {
	t.Setenv("LINGZHU_HOME", t.TempDir())
	dir := updateDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	pending := filepath.Join(dir, updatePendingName)
	confirmed := filepath.Join(dir, updateConfirmedName)
	for _, path := range []string{pending, confirmed} {
		if err := os.WriteFile(path, []byte("1"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	// A fresh marker belongs to an update that is still in flight.
	clearStaleUpdateState()
	if _, err := os.Stat(pending); err != nil {
		t.Fatal("a recent pending marker must be kept")
	}

	// An old marker is abandoned: its watchdog had ample time to decide.
	old := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(pending, old, old); err != nil {
		t.Fatal(err)
	}
	clearStaleUpdateState()
	if _, err := os.Stat(pending); !os.IsNotExist(err) {
		t.Fatal("a stale pending marker was not removed")
	}
	if _, err := os.Stat(confirmed); !os.IsNotExist(err) {
		t.Fatal("a stale confirmed marker was not removed")
	}
}
