package service

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// RestartCore stops and starts the core this app owns. One process serves every
// workspace, so a restart reattaches all of them instead of only the one the
// caller named.
func (s *CoreService) RestartCore(workspace string) error {
	s.mu.Lock()
	runtime := s.spaces[workspace]
	s.mu.Unlock()
	if runtime == nil {
		return fmt.Errorf("unknown workspace: %s", workspace)
	}
	return s.restartSharedCore()
}

// restartSharedCore stops the single core process and starts a replacement,
// then reattaches every open workspace to it.
func (s *CoreService) restartSharedCore() error {
	// A manual restart and the crash supervisor must never run together: both
	// stop a process and start a replacement on the same data directory.
	s.restartMu.Lock()
	defer s.restartMu.Unlock()

	s.mu.Lock()
	shared := s.core
	paths := append([]string(nil), s.order...)
	s.mu.Unlock()
	if shared != nil && !shared.Owned {
		return errors.New("this core was not started by the app; restart it externally")
	}
	for _, path := range paths {
		s.stopWorkspaceTails(path)
	}

	s.mu.Lock()
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
		}
	}
	s.mu.Unlock()

	if shared != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		_ = shared.Stop(ctx)
		cancel()
	}

	var lastErr error
	for _, path := range paths {
		s.mu.Lock()
		runtime := s.spaces[path]
		s.mu.Unlock()
		if runtime == nil {
			continue
		}
		if err := s.startCore(runtime); err != nil {
			s.mu.Lock()
			runtime.Err = err.Error()
			s.mu.Unlock()
			lastErr = err
		}
	}
	return lastErr
}
