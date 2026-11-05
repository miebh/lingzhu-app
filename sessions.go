package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"lingzhu-app/internal/core"
)

func (s *CoreService) Sessions(workspace string) ([]core.SessionInfo, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.SessionInfo, error) {
		return client.Sessions(s.ctx)
	})
}

func (s *CoreService) Messages(workspace, sessionID string) ([]core.Message, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.Message, error) {
		return client.Messages(s.ctx, sessionID)
	})
}

func (s *CoreService) Context(workspace, sessionID string) (core.ContextInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ContextInfo, error) {
		return client.Context(s.ctx, sessionID)
	})
}

// Send starts a turn when idle, or queues the text behind the active run.
// Queued input is delivered by the original stream at its next model boundary.
func (s *CoreService) Send(workspace, sessionID, text, providerID, model string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		key := streamKey(workspace, sessionID)
		for {
			s.mu.Lock()
			state := s.streams[key]
			if state == nil {
				ctx, cancel := context.WithCancel(s.ctx)
				state = &streamState{cancel: cancel, done: make(chan struct{})}
				s.streams[key] = state
				s.mu.Unlock()
				go s.streamTurn(client, workspace, sessionID, text, providerID, model, key, ctx, state)
				return nil
			}
			s.mu.Unlock()

			if err := client.Input(s.ctx, sessionID, text); err == nil {
				return nil
			} else if !errors.Is(err, core.ErrNotRunning) {
				return err
			}
			// The run ended between the local busy check and the input request.
			// Wait for its stream to settle, then retry as a normal turn.
			select {
			case <-state.done:
			case <-s.ctx.Done():
				return s.ctx.Err()
			}
		}
	})
}

func (s *CoreService) streamTurn(
	client *core.Client,
	workspace, sessionID, text, providerID, model, key string,
	ctx context.Context,
	state *streamState,
) {
	defer func() {
		s.mu.Lock()
		if s.streams[key] == state {
			delete(s.streams, key)
		}
		s.mu.Unlock()
		state.cancel()
		close(state.done)
	}()
	// Events arrive through the workspace feed. The prompt stream only has to
	// stay open until the turn ends so the error path can report failures.
	var err error
	for attempt := 0; attempt < 2; attempt++ {
		err = client.Prompt(ctx, sessionID, text, providerID, model, func(core.Event) {})
		if !errors.Is(err, core.ErrBusy) {
			break
		}
		// A recovered run has no local stream, so /prompt is busy even though
		// this client owns no send. Queue the text instead.
		inputErr := client.Input(s.ctx, sessionID, text)
		if inputErr == nil {
			return
		}
		if !errors.Is(inputErr, core.ErrNotRunning) {
			err = inputErr
			break
		}
		// The recovered run ended before the input arrived; retry as a normal
		// prompt once.
	}
	if err != nil && !errors.Is(err, context.Canceled) {
		s.emit(EventEnvelope{
			Workspace: workspace,
			SessionID: sessionID,
			Type:      "client.error",
			At:        time.Now(),
			Data:      map[string]any{"message": err.Error()},
		})
	}
	s.emit(EventEnvelope{Workspace: workspace, SessionID: sessionID, Type: "client.done", At: time.Now()})
}

func (s *CoreService) Interrupt(workspace, sessionID string) (bool, error) {
	return callClient(s, workspace, func(client *core.Client) (bool, error) {
		return client.Interrupt(s.ctx, sessionID)
	})
}

func (s *CoreService) Pending(workspace, sessionID string) ([]core.PermissionRequest, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.PermissionRequest, error) {
		return client.PendingPermissions(s.ctx, sessionID)
	})
}

func (s *CoreService) Reply(workspace, sessionID, requestID, decision, message string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.ReplyPermission(s.ctx, sessionID, requestID, decision, message)
	})
}

func (s *CoreService) Compact(workspace, sessionID string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Compact(s.ctx, sessionID)
	})
}

func (s *CoreService) Rename(workspace, sessionID, title string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Rename(s.ctx, sessionID, title)
	})
}

// SelectModel persists a session-level provider/model override.
func (s *CoreService) SelectModel(workspace, sessionID, providerID, model string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.SetModel(s.ctx, sessionID, providerID, model)
	})
}

func (s *CoreService) Delete(workspace, sessionID string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Delete(s.ctx, sessionID)
	})
}

// NewSessionID returns an ID the core accepts, used before the first message.
func (s *CoreService) NewSessionID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("s-%d", time.Now().UnixNano())
	}
	return "s-" + hex.EncodeToString(buf)
}

func streamKey(workspace, sessionID string) string {
	return workspace + "\x00" + sessionID
}
