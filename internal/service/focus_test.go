package service

import (
	"testing"
	"time"
)

// A toast click arrives at a background process, which Windows refuses to let
// take the foreground on its own. The native raise must therefore exist as a
// separate step; a framework-only Focus() call would only flash the taskbar.
func TestRaiseMainWindowIsWired(t *testing.T) {
	// No window belongs to this test process, so the call must report failure
	// rather than panic or hang on the window enumerator.
	if raiseMainWindow() {
		t.Fatal("a test process has no main window to raise")
	}
}

// The retry must not block the caller: it runs on the notification callback,
// which the shell is waiting on.
func TestRaiseWithRetryReturnsImmediately(t *testing.T) {
	start := time.Now()
	raiseWithRetry()
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("raiseWithRetry blocked for %s", elapsed)
	}
}
