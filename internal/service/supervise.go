package service

import (
	"context"
	"time"

	"lingzhu-app/internal/core"
)

// coreEventChannel announces core lifecycle changes to the webview. It is
// separate from the session event stream because it describes the process, not
// a conversation.
const coreEventChannel = "lingzhu:core"

// CoreStatus is the payload of a core lifecycle event.
type CoreStatus struct {
	// State is "restarting", "ready", "failed" or "started". "started" is the
	// one the first cold start reports: the window was already up, so the
	// frontend re-reads the workspace list it listed optimistically.
	State string `json:"state"`
	// Attempt counts consecutive automatic restarts; it resets on success.
	Attempt int `json:"attempt,omitempty"`
	// Error carries the last failure message.
	Error string `json:"error,omitempty"`
}

// minRestartBackoff and maxRestartBackoff bound the delay between automatic
// restarts, so a core that fails on every start does not spin.
const (
	minRestartBackoff = 500 * time.Millisecond
	maxRestartBackoff = 30 * time.Second
)

// superviseCore restarts the core when it exits on its own. Without this a
// crashed core leaves every workspace disconnected until the user presses
// "Restart core" by hand.
//
// A deliberate stop is not supervised: Stop marks the process, so a restart
// after a settings change or a manual restart never races the intended one.
func (s *CoreService) superviseCore(shared *core.Core) {
	s.superviseCoreWithDone(shared, shared.Done())
}

// superviseCoreWithDone is superviseCore with the exit channel passed in, so a
// test can drive the exit without spawning a process.
func (s *CoreService) superviseCoreWithDone(shared *core.Core, done <-chan struct{}) {
	if done == nil {
		return
	}
	go func() {
		select {
		case <-done:
		case <-s.ctx.Done():
			return
		}
		if shared.Stopping() || s.ctx.Err() != nil {
			return
		}
		s.restartCrashedCore(shared)
	}()
}

// restartCrashedCore replaces a core that exited without being asked to.
func (s *CoreService) restartCrashedCore(crashed *core.Core) {
	s.restartCrashedCoreFrom(crashed, nil)
}

// restartCrashedCoreFrom retries with a growing delay, reattaches every
// workspace and reports each step so the UI can show why the app is briefly
// unavailable. A non-nil stop channel ends the retry loop early.
func (s *CoreService) restartCrashedCoreFrom(crashed *core.Core, stop <-chan struct{}) {
	// A manual restart and the crash supervisor must never run together: both
	// stop a process and start a replacement on the same data directory.
	s.restartMu.Lock()
	defer s.restartMu.Unlock()

	backoff := minRestartBackoff
	for attempt := 1; ; attempt++ {
		if s.ctx.Err() != nil {
			return
		}
		select {
		case <-stop:
			return
		default:
		}

		s.mu.Lock()
		// Another restart already replaced it, or the app is shutting down. The
		// check only applies before the first attempt: after a failed attempt
		// this supervisor has already cleared s.core itself.
		if attempt == 1 && s.core != crashed {
			s.mu.Unlock()
			return
		}
		paths := append([]string(nil), s.order...)
		for _, cancel := range s.feeds {
			cancel()
		}
		s.feeds = map[string]context.CancelFunc{}
		s.core = nil
		for _, path := range paths {
			if runtime := s.spaces[path]; runtime != nil {
				runtime.Core = nil
				runtime.Addr = ""
				runtime.Err = ""
				// Requests arriving while the replacement starts wait for it
				// rather than failing against the process that just exited.
				runtime.beginStart()
			}
		}
		s.mu.Unlock()

		s.emitCore(CoreStatus{State: "restarting", Attempt: attempt})

		var lastErr error
		for _, path := range paths {
			s.mu.Lock()
			runtime := s.spaces[path]
			s.mu.Unlock()
			if runtime == nil {
				continue
			}
			if err := s.attach(runtime); err != nil {
				lastErr = err
			}
		}
		if lastErr == nil {
			s.emitCore(CoreStatus{State: "ready"})
			return
		}
		s.emitCore(CoreStatus{State: "failed", Attempt: attempt, Error: lastErr.Error()})

		select {
		case <-time.After(backoff):
		case <-s.ctx.Done():
			return
		case <-stop:
			return
		}
		backoff *= 2
		if backoff > maxRestartBackoff {
			backoff = maxRestartBackoff
		}
	}
}

// start attaches one workspace to the shared core. It is a seam so a test can
// drive the supervisor without spawning a process.
func (s *CoreService) start(runtime *workspaceRuntime) error {
	if s.startCoreFn != nil {
		return s.startCoreFn(runtime)
	}
	return s.startCore(runtime)
}
