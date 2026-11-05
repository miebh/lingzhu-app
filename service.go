package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"lingzhu-app/internal/appdb"
	"lingzhu-app/internal/core"
	"lingzhu-app/internal/preferences"
	"lingzhu-app/internal/workspaces"
)

// eventChannel is the Wails event name the frontend subscribes to.
const eventChannel = "lingzhu:event"

// CoreService bridges the webview and one core process per workspace.
type CoreService struct {
	ctx         context.Context
	configPath  string
	baseData    string
	defaultRoot string
	store       *workspaces.Store
	prefs       *preferences.Store
	db          *sql.DB
	appDBPath   string
	err         string

	mu sync.Mutex
	// configMu serializes read-modify-write cycles on the shared config file.
	configMu sync.Mutex
	order    []string
	spaces   map[string]*workspaceRuntime
	streams  map[string]*streamState
	feeds    map[string]context.CancelFunc
	// emitEvent is a test seam; production uses the Wails event emitter.
	emitEvent func(EventEnvelope)
}

// streamState is the active event stream of one session. done closes after the
// stream is removed from the map, so a sender can wait out a finishing run.
type streamState struct {
	cancel context.CancelFunc
	done   chan struct{}
}

type workspaceRuntime struct {
	Path string
	Name string
	Core *core.Core
	Addr string
	Err  string
}

// WorkspaceInfo describes one workspace and its core process.
type WorkspaceInfo struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Addr      string `json:"addr"`
	Connected bool   `json:"connected"`
	Error     string `json:"error"`
}

// EventEnvelope is one core event tagged with its workspace and session.
type EventEnvelope struct {
	Workspace string         `json:"workspace"`
	SessionID string         `json:"sessionId"`
	Seq       int64          `json:"seq"`
	Type      string         `json:"type"`
	At        time.Time      `json:"at"`
	Data      map[string]any `json:"data"`
}

// AppPreferences is the local, immediately applied preference document. It is
// separate from the shared core config and never restarts a core.
type AppPreferences struct {
	DefaultWorkspace string                `json:"defaultWorkspace"`
	AutoApprove      bool                  `json:"autoApprove"`
	DefaultModel     ModelSelection        `json:"defaultModel"`
	FavoriteModels   []ModelSelection      `json:"favoriteModels"`
	RecentModels     []ModelSelection      `json:"recentModels"`
	Appearance       AppearancePreferences `json:"appearance"`
}

// ModelSelection is the last used provider/model, shared by the whole app.
type ModelSelection struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

// AppearancePreferences controls the client look without touching core config.
type AppearancePreferences struct {
	FontFamily    string `json:"fontFamily"`
	Density       string `json:"density"`
	TimelineWidth string `json:"timelineWidth"`
	ReduceMotion  string `json:"reduceMotion"`
}

// AppInfo is the read-only About payload.
type AppInfo struct {
	Version      string `json:"version"`
	Built        string `json:"built"`
	ConfigPath   string `json:"configPath"`
	DatabasePath string `json:"databasePath"`
	AppDataDir   string `json:"appDataDir"`
	DataDir      string `json:"dataDir"`
	LogPath      string `json:"logPath"`
}

// Core defaults used when the config file omits a field. Keep them in sync
// with lingzhu/internal/config.
const (
	defaultMaxSteps      = 16
	defaultContextWindow = 128000
	defaultCompactKeep   = 15000
)

func NewCoreService() *CoreService {
	return &CoreService{
		spaces:  map[string]*workspaceRuntime{},
		streams: map[string]*streamState{},
		feeds:   map[string]context.CancelFunc{},
	}
}

func (s *CoreService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	s.ctx = ctx
	s.configPath = discoverConfig()
	s.baseData = resolveBaseData(s.configPath)
	s.defaultRoot = discoverWorkdir(s.configPath)
	if s.defaultRoot == "" {
		s.defaultRoot, _ = os.Getwd()
	}

	db, dbPath, err := appdb.Open()
	if err != nil {
		s.err = err.Error()
		return nil
	}
	s.db = db
	s.appDBPath = dbPath
	appDir := filepath.Dir(dbPath)

	prefs, err := preferences.Open(db, appDir)
	if err != nil {
		_ = db.Close()
		s.db = nil
		s.err = err.Error()
		return nil
	}
	s.prefs = prefs

	store, err := workspaces.Open(db, appDir)
	if err != nil {
		s.err = err.Error()
		return nil
	}
	s.store = store

	list, err := store.List()
	if err != nil {
		s.err = err.Error()
		return nil
	}
	if len(list) == 0 {
		if _, addErr := store.Add(s.defaultRoot); addErr != nil {
			s.err = addErr.Error()
			return nil
		}
		list, _ = store.List()
	}
	for _, item := range list {
		s.open(item.Path)
	}
	s.startCatalogFetch()
	return nil
}

func (s *CoreService) ServiceShutdown() error {
	s.mu.Lock()
	for _, state := range s.streams {
		state.cancel()
	}
	s.streams = map[string]*streamState{}
	for _, cancel := range s.feeds {
		cancel()
	}
	s.feeds = map[string]context.CancelFunc{}
	runtimes := make([]*workspaceRuntime, 0, len(s.order))
	for _, path := range s.order {
		runtimes = append(runtimes, s.spaces[path])
	}
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	for _, runtime := range runtimes {
		if runtime != nil && runtime.Core != nil {
			_ = runtime.Core.Stop(ctx)
		}
	}
	if s.db != nil {
		_ = s.db.Close()
	}
	return nil
}

func (s *CoreService) Workspaces() []WorkspaceInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]WorkspaceInfo, 0, len(s.order))
	for _, path := range s.order {
		runtime := s.spaces[path]
		if runtime == nil {
			continue
		}
		out = append(out, WorkspaceInfo{
			Path:      runtime.Path,
			Name:      runtime.Name,
			Addr:      runtime.Addr,
			Connected: runtime.Core != nil,
			Error:     runtime.Err,
		})
	}
	return out
}

// AddWorkspace asks for a directory and registers it as a workspace.
func (s *CoreService) AddWorkspace() (WorkspaceInfo, error) {
	app := application.Get()
	if app == nil {
		return WorkspaceInfo{}, errors.New("application is not ready")
	}
	dir, err := app.Dialog.OpenFile().
		SetTitle("Add workspace").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
	if err != nil {
		return WorkspaceInfo{}, err
	}
	if strings.TrimSpace(dir) == "" {
		return WorkspaceInfo{}, errors.New("no directory selected")
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return WorkspaceInfo{}, err
	}
	abs = filepath.Clean(abs)

	s.mu.Lock()
	for path := range s.spaces {
		if strings.EqualFold(path, abs) {
			info := s.infoLocked(path)
			s.mu.Unlock()
			return info, nil
		}
	}
	s.mu.Unlock()

	if s.store != nil {
		if _, err := s.store.Add(abs); err != nil {
			return WorkspaceInfo{}, err
		}
	}
	runtime := s.open(abs)
	info := WorkspaceInfo{Path: runtime.Path, Name: runtime.Name, Addr: runtime.Addr, Connected: runtime.Core != nil, Error: runtime.Err}
	if runtime.Err != "" {
		return info, errors.New(runtime.Err)
	}
	return info, nil
}

// RemoveWorkspace stops the workspace's core and forgets the directory. Its
// session data stays on disk.
func (s *CoreService) RemoveWorkspace(path string) error {
	s.mu.Lock()
	runtime := s.spaces[path]
	delete(s.spaces, path)
	order := s.order[:0]
	for _, item := range s.order {
		if item != path {
			order = append(order, item)
		}
	}
	s.order = order
	prefix := path + "\x00"
	for key, state := range s.streams {
		if strings.HasPrefix(key, prefix) {
			state.cancel()
			delete(s.streams, key)
		}
	}
	if cancel := s.feeds[path]; cancel != nil {
		cancel()
		delete(s.feeds, path)
	}
	s.mu.Unlock()

	if runtime != nil && runtime.Core != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		_ = runtime.Core.Stop(ctx)
		cancel()
	}
	if s.store != nil {
		_, _ = s.store.Remove(path)
	}
	return nil
}

func (s *CoreService) open(path string) *workspaceRuntime {
	s.mu.Lock()
	if runtime, ok := s.spaces[path]; ok {
		s.mu.Unlock()
		return runtime
	}
	runtime := &workspaceRuntime{Path: path, Name: filepath.Base(path)}
	s.spaces[path] = runtime
	s.order = append(s.order, path)
	s.mu.Unlock()

	if err := s.startCore(runtime); err != nil {
		s.mu.Lock()
		runtime.Err = err.Error()
		s.mu.Unlock()
	}
	return runtime
}

func (s *CoreService) startCore(runtime *workspaceRuntime) error {
	// A core started by hand on the default address serves the default
	// workspace; reuse it instead of spawning a second one on the same data.
	if runtime.Path == s.defaultRoot {
		client := core.New("http://" + core.DefaultAddr)
		probeCtx, cancel := context.WithTimeout(s.ctx, time.Second)
		err := client.Health(probeCtx)
		cancel()
		if err == nil {
			s.mu.Lock()
			runtime.Core = &core.Core{Client: client, Addr: core.DefaultAddr}
			runtime.Addr = core.DefaultAddr
			s.mu.Unlock()
			s.watchEvents(runtime.Path, client)
			return nil
		}
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		addr, err := freeAddr()
		if err != nil {
			return err
		}
		info, err := core.Ensure(s.ctx, core.Options{
			Addr:    addr,
			Binary:  os.Getenv("LINGZHU_CORE"),
			Workdir: runtime.Path,
			DataDir: s.dataDir(runtime.Path),
			Config:  s.configPath,
		})
		if err == nil {
			s.mu.Lock()
			runtime.Core = info
			runtime.Addr = info.Addr
			runtime.Err = ""
			s.mu.Unlock()
			s.watchEvents(runtime.Path, info.Client)
			return nil
		}
		lastErr = err
	}
	return lastErr
}

func (s *CoreService) client(workspace string) (*core.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	runtime, ok := s.spaces[workspace]
	if !ok {
		return nil, fmt.Errorf("unknown workspace: %s", workspace)
	}
	if runtime.Core == nil {
		if runtime.Err != "" {
			return nil, errors.New(runtime.Err)
		}
		return nil, errors.New("workspace core is not running")
	}
	return runtime.Core.Client, nil
}

// callClient resolves a workspace's core and returns fn's value. It keeps the
// "unknown workspace / core not running" mapping in one place.
func callClient[T any](s *CoreService, workspace string, fn func(*core.Client) (T, error)) (T, error) {
	client, err := s.client(workspace)
	if err != nil {
		var zero T
		return zero, err
	}
	return fn(client)
}

// doClient is callClient for methods that only report an error.
func doClient(s *CoreService, workspace string, fn func(*core.Client) error) error {
	_, err := callClient(s, workspace, func(client *core.Client) (struct{}, error) {
		return struct{}{}, fn(client)
	})
	return err
}

func (s *CoreService) infoLocked(path string) WorkspaceInfo {
	runtime := s.spaces[path]
	if runtime == nil {
		return WorkspaceInfo{Path: path}
	}
	return WorkspaceInfo{
		Path:      runtime.Path,
		Name:      runtime.Name,
		Addr:      runtime.Addr,
		Connected: runtime.Core != nil,
		Error:     runtime.Err,
	}
}

func (s *CoreService) emit(event EventEnvelope) {
	if s.emitEvent != nil {
		s.emitEvent(event)
		return
	}
	if app := application.Get(); app != nil {
		app.Event.Emit(eventChannel, event)
	}
}

// watchEvents follows the all-session stream of one workspace core and
// reconnects after a dropped connection.
func (s *CoreService) watchEvents(workspace string, client *core.Client) {
	ctx, cancel := context.WithCancel(s.ctx)
	s.mu.Lock()
	if old := s.feeds[workspace]; old != nil {
		old()
	}
	s.feeds[workspace] = cancel
	s.mu.Unlock()

	go func() {
		for ctx.Err() == nil {
			err := client.Events(ctx, func(ev core.GlobalEvent) {
				s.emit(EventEnvelope{
					Workspace: workspace,
					SessionID: ev.SessionID,
					Seq:       ev.Seq,
					Type:      ev.Type,
					At:        ev.At,
					Data:      ev.Data,
				})
			})
			if ctx.Err() != nil || errors.Is(err, context.Canceled) {
				return
			}
			select {
			case <-time.After(500 * time.Millisecond):
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (s *CoreService) stopFeed(workspace string) {
	s.mu.Lock()
	cancel := s.feeds[workspace]
	delete(s.feeds, workspace)
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func freeAddr() (string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	addr := listener.Addr().String()
	if err := listener.Close(); err != nil {
		return "", err
	}
	return addr, nil
}
