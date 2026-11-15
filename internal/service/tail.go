package service

import (
	"context"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
	"lingzhu-app/internal/core"
)

// tailChannel is the Wails event name for per-session event tails.
const tailChannel = "lingzhu:tail"

// SessionTailEvent is one live event from a per-session follow stream.
type SessionTailEvent struct {
	Workspace string     `json:"workspace"`
	SessionID string     `json:"sessionId"`
	Event     core.Event `json:"event"`
}

type tailState struct {
	cancel context.CancelFunc
}

func tailKey(workspace, sessionID string) string {
	return workspace + "\x00" + sessionID
}

// StartSessionTail follows one session's event stream and emits each event on
// tailChannel. Starting again replaces the previous tail for the same session.
func (s *CoreService) StartSessionTail(workspace, sessionID string, after int64) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(s.ctx)
	key := tailKey(workspace, sessionID)
	state := &tailState{cancel: cancel}
	s.mu.Lock()
	if old := s.tails[key]; old != nil {
		old.cancel()
	}
	s.tails[key] = state
	s.mu.Unlock()

	go func() {
		_ = client.FollowSessionEvents(ctx, sessionID, after, func(event core.Event) {
			s.emitTail(SessionTailEvent{Workspace: workspace, SessionID: sessionID, Event: event})
		})
		s.mu.Lock()
		if s.tails[key] == state {
			delete(s.tails, key)
		}
		s.mu.Unlock()
	}()
	return nil
}

// StopSessionTail stops the follow stream of one session.
func (s *CoreService) StopSessionTail(workspace, sessionID string) {
	key := tailKey(workspace, sessionID)
	s.mu.Lock()
	state := s.tails[key]
	delete(s.tails, key)
	s.mu.Unlock()
	if state != nil {
		state.cancel()
	}
}

// stopWorkspaceTails stops every session tail belonging to one workspace.
func (s *CoreService) stopWorkspaceTails(workspace string) {
	prefix := workspace + "\x00"
	s.mu.Lock()
	states := make([]*tailState, 0)
	for key, state := range s.tails {
		if strings.HasPrefix(key, prefix) {
			states = append(states, state)
			delete(s.tails, key)
		}
	}
	s.mu.Unlock()
	for _, state := range states {
		state.cancel()
	}
}

func (s *CoreService) emitTail(event SessionTailEvent) {
	if app := application.Get(); app != nil {
		app.Event.Emit(tailChannel, event)
	}
}
