package service

import (
	"strings"
	"sync"
	"time"
)

// runWatch tracks the turn state of one session so the app can raise a
// completion notice from the event stream itself. The webview is not a
// reliable trigger: a minimised window lets WebView2 suspend its timers, so a
// notice that waited for the page to notice the end of a run would arrive only
// when the user came back — the one moment it is not needed.
type runWatch struct {
	running bool
	// lastEvent bounds how stale a settled run may be before it stops
	// counting as news.
	lastEvent time.Time
}

// noticeWatcher turns session events into completion notices.
type noticeWatcher struct {
	mu       sync.Mutex
	sessions map[string]*runWatch
	// quiet is the window after the last event during which a notice is still
	// worth raising; anything older belongs to a session the user already saw.
	quiet time.Duration
}

func newNoticeWatcher() *noticeWatcher {
	return &noticeWatcher{
		sessions: map[string]*runWatch{},
		quiet:    2 * time.Minute,
	}
}

// observe folds one event into the watcher and returns the notice to raise, if
// this event ended a run the user was not watching.
func (w *noticeWatcher) observe(ev EventEnvelope, focused bool) (TaskNotice, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()

	watch := w.sessions[ev.SessionID]
	if watch == nil {
		watch = &runWatch{}
		w.sessions[ev.SessionID] = watch
	}
	now := ev.At
	if now.IsZero() {
		now = time.Now()
	}
	watch.lastEvent = now

	switch ev.Type {
	case "turn.started", "user.message":
		watch.running = true
		return TaskNotice{}, false
	case "run.end", "run.failed", "error":
		if !watch.running {
			// A replayed stream reports ends for turns that already settled;
			// only the transition is news.
			return TaskNotice{}, false
		}
		watch.running = false
		// The user is looking at this session, so the transcript already
		// shows the outcome.
		if focused {
			return TaskNotice{}, false
		}
		if ev.Type == "run.end" {
			if reason, _ := ev.Data["reason"].(string); reason == "interrupted" {
				// Stopping is not completion, and a resumed successor usually
				// starts immediately after it.
				return TaskNotice{}, false
			}
		}
		return TaskNotice{
			Workspace: ev.Workspace,
			SessionID: ev.SessionID,
			Failed:    ev.Type != "run.end",
			Message:   noticeMessage(ev),
		}, true
	default:
		return TaskNotice{}, false
	}
}

// prune drops sessions that have been idle longer than the quiet window, so a
// long-lived app does not accumulate a row per session it ever saw.
func (w *noticeWatcher) prune(now time.Time) {
	w.mu.Lock()
	defer w.mu.Unlock()
	for key, watch := range w.sessions {
		if now.Sub(watch.lastEvent) > w.quiet && !watch.running {
			delete(w.sessions, key)
		}
	}
}

// forget drops one session, so a deleted session never reports again.
func (w *noticeWatcher) forget(sessionID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.sessions, sessionID)
}

// noticeMessage returns the provider's own failure text. Copy that belongs to
// the app is written by the webview, which is the only place that knows the
// user's language.
func noticeMessage(ev EventEnvelope) string {
	if ev.Type == "run.end" {
		return ""
	}
	message, _ := ev.Data["message"].(string)
	return truncateNotice(strings.TrimSpace(message), 200)
}
