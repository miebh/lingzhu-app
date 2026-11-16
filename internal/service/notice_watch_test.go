package service

import (
	"testing"
	"time"
)

func start(sessionID string) EventEnvelope {
	return EventEnvelope{SessionID: sessionID, Workspace: "/w", Type: "user.message", At: time.Now()}
}

func end(sessionID string) EventEnvelope {
	return EventEnvelope{SessionID: sessionID, Workspace: "/w", Type: "run.end", At: time.Now()}
}

// A run that ends while the user is elsewhere is the case a desktop notice
// exists for.
func TestWatcherReportsFinishedRun(t *testing.T) {
	watcher := newNoticeWatcher()
	if _, ok := watcher.observe(start("s1"), false); ok {
		t.Fatal("a starting run reported")
	}
	notice, ok := watcher.observe(end("s1"), false)
	if !ok {
		t.Fatal("a finished run did not report")
	}
	if notice.SessionID != "s1" || notice.Workspace != "/w" {
		t.Fatalf("notice names the wrong session: %+v", notice)
	}
	if notice.Failed {
		t.Fatal("a clean finish was reported as a failure")
	}
}

// The conversation on screen already explains its own outcome.
func TestWatcherStaysQuietForWatchedSession(t *testing.T) {
	watcher := newNoticeWatcher()
	watcher.observe(start("s1"), true)
	if _, ok := watcher.observe(end("s1"), true); ok {
		t.Fatal("the watched session reported")
	}
}

// A replayed stream reports ends for turns that already settled; only the
// transition into a settled run is news.
func TestWatcherIgnoresEndWithoutStart(t *testing.T) {
	watcher := newNoticeWatcher()
	if _, ok := watcher.observe(end("s1"), false); ok {
		t.Fatal("an end without a start reported")
	}
	if _, ok := watcher.observe(end("s1"), false); ok {
		t.Fatal("the same end reported twice")
	}
}

// A failed run carries the provider's own text, not a sentence written in Go:
// the webview owns the message catalog.
func TestWatcherCarriesFailureMessage(t *testing.T) {
	watcher := newNoticeWatcher()
	watcher.observe(start("s1"), false)
	failure := EventEnvelope{
		SessionID: "s1",
		Workspace: "/w",
		Type:      "run.failed",
		At:        time.Now(),
		Data:      map[string]any{"message": "provider exploded"},
	}
	notice, ok := watcher.observe(failure, false)
	if !ok {
		t.Fatal("a failed run did not report")
	}
	if !notice.Failed {
		t.Fatal("a failed run was not marked as one")
	}
	if notice.Message != "provider exploded" {
		t.Fatalf("unexpected message: %q", notice.Message)
	}
	if notice.Body != "" {
		t.Fatalf("the watcher must not write copy: %q", notice.Body)
	}
}

// A session that was deleted must not report again.
func TestWatcherForgetsDeletedSession(t *testing.T) {
	watcher := newNoticeWatcher()
	watcher.observe(start("s1"), false)
	watcher.forget("s1")
	if _, ok := watcher.observe(end("s1"), false); ok {
		t.Fatal("a deleted session reported")
	}
}

// Idle sessions are dropped so a long-lived app does not keep a row per
// session it ever saw.
func TestWatcherPrunesIdleSessions(t *testing.T) {
	watcher := newNoticeWatcher()
	watcher.observe(start("s1"), false)
	watcher.observe(end("s1"), false)
	watcher.prune(time.Now().Add(10 * time.Minute))
	watcher.mu.Lock()
	count := len(watcher.sessions)
	watcher.mu.Unlock()
	if count != 0 {
		t.Fatalf("idle session survived the prune: %d", count)
	}
}
