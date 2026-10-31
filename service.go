package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"lingzhu-app/internal/core"
)

// eventChannel is the Wails event name the frontend subscribes to.
const eventChannel = "lingzhu:event"

// CoreService bridges the webview and the lingzhu core process.
type CoreService struct {
	ctx  context.Context
	core *core.Core
	err  string

	mu      sync.Mutex
	streams map[string]context.CancelFunc
}

// Status is what the frontend shows about the connection to the core.
type Status struct {
	Connected bool   `json:"connected"`
	Addr      string `json:"addr"`
	Owned     bool   `json:"owned"`
	LogPath   string `json:"logPath"`
	Error     string `json:"error"`
}

// EventEnvelope is one core event tagged with its session.
type EventEnvelope struct {
	SessionID string         `json:"sessionId"`
	Seq       int64          `json:"seq"`
	Type      string         `json:"type"`
	At        time.Time      `json:"at"`
	Data      map[string]any `json:"data"`
}

func NewCoreService() *CoreService {
	return &CoreService{streams: map[string]context.CancelFunc{}}
}

func (s *CoreService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	s.ctx = ctx
	config := discoverConfig()
	workdir := os.Getenv("LINGZHU_WORKDIR")
	if workdir == "" {
		workdir = discoverWorkdir(config)
	}
	info, err := core.Ensure(ctx, core.Options{
		Addr:    os.Getenv("LINGZHU_ADDR"),
		Binary:  os.Getenv("LINGZHU_CORE"),
		Workdir: workdir,
		DataDir: os.Getenv("LINGZHU_DATA_DIR"),
		Config:  config,
	})
	if err != nil {
		s.err = err.Error()
		s.emitStatus()
		return nil
	}
	s.core = info
	s.emitStatus()
	return nil
}

func (s *CoreService) ServiceShutdown() error {
	s.mu.Lock()
	for _, cancel := range s.streams {
		cancel()
	}
	s.streams = map[string]context.CancelFunc{}
	s.mu.Unlock()
	if s.core == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	return s.core.Stop(ctx)
}

func (s *CoreService) Status() Status {
	status := Status{Error: s.err}
	if s.core != nil {
		status.Connected = true
		status.Addr = s.core.Addr
		status.Owned = s.core.Owned
		status.LogPath = s.core.LogPath
	}
	return status
}

func (s *CoreService) Sessions() ([]core.SessionInfo, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	return s.core.Client.Sessions(s.ctx)
}

func (s *CoreService) Messages(sessionID string) ([]core.Message, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	return s.core.Client.Messages(s.ctx, sessionID)
}

func (s *CoreService) Context(sessionID string) (core.ContextInfo, error) {
	if err := s.ready(); err != nil {
		return core.ContextInfo{}, err
	}
	return s.core.Client.Context(s.ctx, sessionID)
}

// Send starts a turn and streams its events to the frontend. It returns as soon
// as the turn starts; completion arrives as a run.end event.
func (s *CoreService) Send(sessionID, text string) error {
	if err := s.ready(); err != nil {
		return err
	}
	s.mu.Lock()
	if _, busy := s.streams[sessionID]; busy {
		s.mu.Unlock()
		return errors.New("session is already running")
	}
	ctx, cancel := context.WithCancel(s.ctx)
	s.streams[sessionID] = cancel
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.streams, sessionID)
			s.mu.Unlock()
			cancel()
		}()
		err := s.core.Client.Prompt(ctx, sessionID, text, func(ev core.Event) {
			s.emit(EventEnvelope{SessionID: sessionID, Seq: ev.Seq, Type: ev.Type, At: ev.At, Data: ev.Data})
		})
		if err != nil && !errors.Is(err, context.Canceled) {
			s.emit(EventEnvelope{
				SessionID: sessionID,
				Type:      "client.error",
				At:        time.Now(),
				Data:      map[string]any{"message": err.Error()},
			})
		}
		s.emit(EventEnvelope{SessionID: sessionID, Type: "client.done", At: time.Now()})
	}()
	return nil
}

func (s *CoreService) Interrupt(sessionID string) (bool, error) {
	if err := s.ready(); err != nil {
		return false, err
	}
	return s.core.Client.Interrupt(s.ctx, sessionID)
}

func (s *CoreService) Pending(sessionID string) ([]core.PermissionRequest, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	return s.core.Client.PendingPermissions(s.ctx, sessionID)
}

func (s *CoreService) Reply(sessionID, requestID, decision, message string) error {
	if err := s.ready(); err != nil {
		return err
	}
	return s.core.Client.ReplyPermission(s.ctx, sessionID, requestID, decision, message)
}

func (s *CoreService) Compact(sessionID string) error {
	if err := s.ready(); err != nil {
		return err
	}
	return s.core.Client.Compact(s.ctx, sessionID)
}

func (s *CoreService) Rename(sessionID, title string) error {
	if err := s.ready(); err != nil {
		return err
	}
	return s.core.Client.Rename(s.ctx, sessionID, title)
}

func (s *CoreService) Delete(sessionID string) error {
	if err := s.ready(); err != nil {
		return err
	}
	return s.core.Client.Delete(s.ctx, sessionID)
}

// NewSessionID returns an ID the core accepts, used before the first message.
func (s *CoreService) NewSessionID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("s-%d", time.Now().UnixNano())
	}
	return "s-" + hex.EncodeToString(buf)
}

func (s *CoreService) ready() error {
	if s.core == nil {
		if s.err != "" {
			return errors.New(s.err)
		}
		return errors.New("core is not connected")
	}
	return nil
}

func (s *CoreService) emit(ev EventEnvelope) {
	if app := application.Get(); app != nil {
		app.Event.Emit(eventChannel, ev)
	}
}

func (s *CoreService) emitStatus() {
	if app := application.Get(); app != nil {
		app.Event.Emit("lingzhu:status", s.Status())
	}
}

// discoverConfig looks for a core config from the app's working directory
// upwards, so launching from bin/ still finds the repository configuration.
func discoverConfig() string {
	if path := os.Getenv("LINGZHU_CONFIG"); path != "" {
		return path
	}
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for depth := 0; depth < 5; depth++ {
		for _, candidate := range []string{"config.json", filepath.Join("build", "config.json")} {
			path := filepath.Join(dir, candidate)
			if _, err := os.Stat(path); err == nil {
				abs, _ := filepath.Abs(path)
				return abs
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// discoverWorkdir treats the parent of a build/ config as the project root.
func discoverWorkdir(configPath string) string {
	if configPath == "" {
		return ""
	}
	dir := filepath.Dir(configPath)
	if filepath.Base(dir) == "build" {
		return filepath.Dir(dir)
	}
	return dir
}
