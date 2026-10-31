package main

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"lingzhu-app/internal/core"
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
	err         string

	mu      sync.Mutex
	order   []string
	spaces  map[string]*workspaceRuntime
	streams map[string]context.CancelFunc
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

func NewCoreService() *CoreService {
	return &CoreService{
		spaces:  map[string]*workspaceRuntime{},
		streams: map[string]context.CancelFunc{},
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

	store, err := workspaces.Open()
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
	return nil
}

func (s *CoreService) ServiceShutdown() error {
	s.mu.Lock()
	for _, cancel := range s.streams {
		cancel()
	}
	s.streams = map[string]context.CancelFunc{}
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
	for key, cancel := range s.streams {
		if strings.HasPrefix(key, prefix) {
			cancel()
			delete(s.streams, key)
		}
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

func (s *CoreService) Sessions(workspace string) ([]core.SessionInfo, error) {
	client, err := s.client(workspace)
	if err != nil {
		return nil, err
	}
	return client.Sessions(s.ctx)
}

func (s *CoreService) Messages(workspace, sessionID string) ([]core.Message, error) {
	client, err := s.client(workspace)
	if err != nil {
		return nil, err
	}
	return client.Messages(s.ctx, sessionID)
}

func (s *CoreService) Context(workspace, sessionID string) (core.ContextInfo, error) {
	client, err := s.client(workspace)
	if err != nil {
		return core.ContextInfo{}, err
	}
	return client.Context(s.ctx, sessionID)
}

// Send starts a turn in one workspace and streams its events to the frontend.
func (s *CoreService) Send(workspace, sessionID, text string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	key := streamKey(workspace, sessionID)
	s.mu.Lock()
	if _, busy := s.streams[key]; busy {
		s.mu.Unlock()
		return errors.New("session is already running")
	}
	ctx, cancel := context.WithCancel(s.ctx)
	s.streams[key] = cancel
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.streams, key)
			s.mu.Unlock()
			cancel()
		}()
		err := client.Prompt(ctx, sessionID, text, func(ev core.Event) {
			s.emit(EventEnvelope{
				Workspace: workspace,
				SessionID: sessionID,
				Seq:       ev.Seq,
				Type:      ev.Type,
				At:        ev.At,
				Data:      ev.Data,
			})
		})
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
	}()
	return nil
}

func (s *CoreService) Interrupt(workspace, sessionID string) (bool, error) {
	client, err := s.client(workspace)
	if err != nil {
		return false, err
	}
	return client.Interrupt(s.ctx, sessionID)
}

func (s *CoreService) Pending(workspace, sessionID string) ([]core.PermissionRequest, error) {
	client, err := s.client(workspace)
	if err != nil {
		return nil, err
	}
	return client.PendingPermissions(s.ctx, sessionID)
}

func (s *CoreService) Reply(workspace, sessionID, requestID, decision, message string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	return client.ReplyPermission(s.ctx, sessionID, requestID, decision, message)
}

func (s *CoreService) Compact(workspace, sessionID string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	return client.Compact(s.ctx, sessionID)
}

func (s *CoreService) Rename(workspace, sessionID, title string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	return client.Rename(s.ctx, sessionID, title)
}

func (s *CoreService) Delete(workspace, sessionID string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	return client.Delete(s.ctx, sessionID)
}

// NewSessionID returns an ID the core accepts, used before the first message.
func (s *CoreService) NewSessionID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("s-%d", time.Now().UnixNano())
	}
	return "s-" + hex.EncodeToString(buf)
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

// dataDir keeps the default workspace on the shared data directory so existing
// history stays visible; every other workspace gets its own subdirectory.
func (s *CoreService) dataDir(path string) string {
	if path == s.defaultRoot {
		return s.baseData
	}
	sum := sha1.Sum([]byte(strings.ToLower(path)))
	slug := slugify(filepath.Base(path))
	return filepath.Join(s.baseData, "workspaces", fmt.Sprintf("%s-%x", slug, sum[:4]))
}

func (s *CoreService) emit(event EventEnvelope) {
	if app := application.Get(); app != nil {
		app.Event.Emit(eventChannel, event)
	}
}

func streamKey(workspace, sessionID string) string {
	return workspace + "\x00" + sessionID
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

func slugify(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.':
			b.WriteRune('-')
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		return "workspace"
	}
	if len(slug) > 24 {
		slug = slug[:24]
	}
	return slug
}

// discoverConfig looks for a core config from the app's working directory
// upwards, so launching from build/ still finds the repository configuration.
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

// resolveBaseData mirrors the core's data_dir resolution.
func resolveBaseData(configPath string) string {
	if configPath != "" {
		if data, err := os.ReadFile(configPath); err == nil {
			var file struct {
				DataDir string `json:"data_dir"`
			}
			if json.Unmarshal(data, &file) == nil && file.DataDir != "" {
				return filepath.Join(filepath.Dir(configPath), file.DataDir)
			}
		}
		return filepath.Join(filepath.Dir(configPath), "data")
	}
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	return filepath.Join(base, "lingzhu", "app", "data")
}
