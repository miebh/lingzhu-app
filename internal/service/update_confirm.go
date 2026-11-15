package service

import (
	"os"
	"path/filepath"
	"time"

	"lingzhu-app/internal/global"
)

// Update bookkeeping shared with the installer. The installer writes
// `pending.txt` before replacing the binaries and starts a watchdog; the app
// writes `confirmed.txt` once its core answers, which is what tells the
// watchdog to keep the new build instead of rolling back.
const (
	updatePendingName   = "pending.txt"
	updateConfirmedName = "confirmed.txt"
)

// updateDir is where the installer and the app exchange update state. It is
// beside the install rather than inside it, so a rollback never has to write
// into a directory it is restoring.
//
// The installer hard-codes $LOCALAPPDATA\lingzhu\update, so this has to resolve
// to the same place or the two sides would never see each other's markers.
func updateDir() string {
	if p := global.Override(); p != "" {
		return filepath.Join(p, "update")
	}
	if p := os.Getenv("LOCALAPPDATA"); p != "" {
		return filepath.Join(p, "lingzhu", "update")
	}
	return filepath.Join(global.Cache(), "..", "update")
}

// updatePending reports whether the installer left a build waiting for proof
// that it works.
func updatePending() bool {
	_, err := os.Stat(filepath.Join(updateDir(), updatePendingName))
	return err == nil
}

// confirmUpdate tells the watchdog the new build started successfully. It is
// called once the core is reachable, because a build that installs but cannot
// start a core is exactly the case a rollback exists for.
//
// Writing the marker is best effort: a failure only means the watchdog rolls
// back a working build, which is worse than the reverse but still recoverable
// by installing again.
func confirmUpdate() error {
	if !updatePending() {
		return nil
	}
	dir := updateDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(dir, updateConfirmedName)
	if err := os.WriteFile(path, []byte(time.Now().UTC().Format(time.RFC3339)+"\n"), 0o644); err != nil {
		return err
	}
	return nil
}

// clearStaleUpdateState removes markers left by an update whose watchdog never
// ran, such as when the helper could not start at all. Without this the
// confirmation would be written again on every launch for a build that is
// already in use.
func clearStaleUpdateState() {
	dir := updateDir()
	pending := filepath.Join(dir, updatePendingName)
	info, err := os.Stat(pending)
	if err != nil {
		return
	}
	// A watchdog that was going to run would have decided well within this
	// window, so anything older is abandoned state.
	if time.Since(info.ModTime()) < 15*time.Minute {
		return
	}
	_ = os.Remove(pending)
	_ = os.Remove(filepath.Join(dir, updateConfirmedName))
}
