package main

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"lingzhu-app/internal/appdb"
	"lingzhu-app/internal/core"
	"lingzhu-app/internal/global"
	"lingzhu-app/internal/preferences"
	"lingzhu-app/internal/version"
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

	mu      sync.Mutex
	order   []string
	spaces  map[string]*workspaceRuntime
	streams map[string]*streamState
	feeds   map[string]context.CancelFunc
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

// Send starts a turn when idle, or queues the text behind the active run.
// Queued input is delivered by the original stream at its next model boundary.
func (s *CoreService) Send(workspace, sessionID, text, providerID, model string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
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

// SelectModel persists a session-level provider/model override.
func (s *CoreService) SelectModel(workspace, sessionID, providerID, model string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	return client.SetModel(s.ctx, sessionID, providerID, model)
}

func (s *CoreService) Delete(workspace, sessionID string) error {
	client, err := s.client(workspace)
	if err != nil {
		return err
	}
	return client.Delete(s.ctx, sessionID)
}

// Settings returns the editable subset of the shared config file.
func (s *CoreService) Settings() (AppSettings, error) {
	file, err := s.readConfigFile()
	if err != nil {
		return AppSettings{}, err
	}
	return buildAppSettings(s.configFilePath(), file), nil
}

// SaveSettings validates and writes the shared config file, then restarts the
// workspace cores so every workspace picks it up. It returns the workspaces
// whose core was left alone because this app does not own the process.
func (s *CoreService) SaveSettings(input SettingsInput) ([]string, error) {
	if err := validateSettingsInput(input); err != nil {
		return nil, err
	}

	s.mu.Lock()
	busy := len(s.streams) > 0
	s.mu.Unlock()
	if busy {
		return nil, errors.New("stop running sessions before changing settings")
	}

	file, err := s.readConfigFile()
	if err != nil {
		return nil, err
	}
	applySettingsInput(file, input)

	path := s.configFilePath()
	if err := writeConfigFile(path, file); err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.configPath = path
	s.mu.Unlock()

	return s.restartWorkspaces(), nil
}

// Preferences returns the local app preferences; it never touches core config.
func (s *CoreService) Preferences() AppPreferences {
	prefs := preferences.Default()
	if s.prefs != nil {
		prefs = s.prefs.Get()
	}
	return AppPreferences{
		DefaultWorkspace: prefs.DefaultWorkspace,
		AutoApprove:      prefs.AutoApprove,
		DefaultModel:     ModelSelection{Provider: prefs.DefaultModel.Provider, Model: prefs.DefaultModel.Model},
		Appearance: AppearancePreferences{
			FontFamily:    prefs.Appearance.FontFamily,
			Density:       prefs.Appearance.Density,
			TimelineWidth: prefs.Appearance.TimelineWidth,
			ReduceMotion:  prefs.Appearance.ReduceMotion,
		},
	}
}

// SavePreferences stores local preferences. Changes apply to the webview
// immediately and never restart a core.
func (s *CoreService) SavePreferences(input AppPreferences) error {
	if s.prefs == nil {
		return errors.New("preferences are unavailable")
	}
	return s.prefs.Save(preferences.Preferences{
		DefaultWorkspace: strings.TrimSpace(input.DefaultWorkspace),
		AutoApprove:      input.AutoApprove,
		DefaultModel: preferences.Selection{
			Provider: input.DefaultModel.Provider,
			Model:    input.DefaultModel.Model,
		},
		Appearance: preferences.Appearance{
			FontFamily:    input.Appearance.FontFamily,
			Density:       input.Appearance.Density,
			TimelineWidth: input.Appearance.TimelineWidth,
			ReduceMotion:  input.Appearance.ReduceMotion,
		},
	})
}

// Info returns the read-only diagnostics shown on the About page.
func (s *CoreService) Info() AppInfo {
	buildVersion := version.Version
	if buildVersion == "0.1.0-dev" {
		if build, ok := debug.ReadBuildInfo(); ok && build.Main.Version != "" && build.Main.Version != "(devel)" {
			buildVersion = build.Main.Version
		}
	}
	databasePath := s.appDBPath
	if databasePath == "" {
		databasePath = filepath.Join(localAppDir(), "app.db")
	}
	built := ""
	if exe, err := os.Executable(); err == nil {
		if stat, err := os.Stat(exe); err == nil {
			built = stat.ModTime().Format("2006-01-02 15:04")
		}
	}
	return AppInfo{
		Version:      buildVersion,
		Built:        built,
		ConfigPath:   s.configFilePath(),
		DatabasePath: databasePath,
		AppDataDir:   localAppDir(),
		DataDir:      s.baseData,
		LogPath:      filepath.Join(localCacheDir(), "core.log"),
	}
}

// localAppDir is the per-user directory that holds the app database, matching
// the path package appdb writes to.
func localAppDir() string { return global.AppData() }

// localCacheDir holds the core log, matching internal/core's log location.
func localCacheDir() string { return global.Log() }

// restartWorkspaces stops and starts every core this app owns. Reused cores
// keep running and are reported so the UI can ask the user to restart them.
func (s *CoreService) restartWorkspaces() []string {
	s.mu.Lock()
	paths := append([]string(nil), s.order...)
	s.mu.Unlock()

	reused := make([]string, 0)
	for _, path := range paths {
		s.mu.Lock()
		runtime := s.spaces[path]
		s.mu.Unlock()
		if runtime == nil {
			continue
		}
		if runtime.Core != nil && !runtime.Core.Owned {
			reused = append(reused, runtime.Name)
			continue
		}
		if runtime.Core != nil {
			s.stopFeed(path)
			ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
			_ = runtime.Core.Stop(ctx)
			cancel()
		}
		s.mu.Lock()
		runtime.Core = nil
		runtime.Addr = ""
		runtime.Err = ""
		s.mu.Unlock()
		if err := s.startCore(runtime); err != nil {
			s.mu.Lock()
			runtime.Err = err.Error()
			s.mu.Unlock()
		}
	}
	return reused
}

// configFilePath returns the file the settings dialog edits. Without a
// discovered config, the user config file is the one new cores load, so a
// machine-wide install never writes into the install directory.
func (s *CoreService) configFilePath() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.configPath != "" {
		return s.configPath
	}
	return filepath.Join(global.Config(), "config.json")
}

func (s *CoreService) readConfigFile() (map[string]any, error) {
	path := s.configFilePath()
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	file := map[string]any{}
	if strings.TrimSpace(string(data)) == "" {
		return file, nil
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	return file, nil
}

// writeConfigFile replaces the file through a temp file so a failed write never
// leaves a half-written config behind.
func writeConfigFile(path string, file map[string]any) error {
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func stringSetting(file map[string]any, key string) string {
	value, _ := file[key].(string)
	return value
}

func intSetting(file map[string]any, key string, fallback int) int {
	value, ok := file[key].(float64)
	if !ok {
		return fallback
	}
	n := int(value)
	// Zero is meaningful for the context window: it disables automatic
	// compaction. Every other numeric setting treats zero as unset.
	if key == "context_window" {
		if n < 0 {
			return fallback
		}
		return n
	}
	if n <= 0 {
		return fallback
	}
	return n
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

// discoverConfig returns the core config the app should edit: LINGZHU_CONFIG,
// then a project lingzhu.json beside the working directory, then the user
// config file. It never looks for a build directory.
func discoverConfig() string {
	if path := os.Getenv("LINGZHU_CONFIG"); path != "" {
		return path
	}
	dir, err := os.Getwd()
	if err != nil {
		return filepath.Join(global.Config(), "config.json")
	}
	for depth := 0; depth < 5; depth++ {
		path := filepath.Join(dir, "lingzhu.json")
		if _, err := os.Stat(path); err == nil {
			abs, _ := filepath.Abs(path)
			return abs
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return filepath.Join(global.Config(), "config.json")
}

// discoverWorkdir treats the directory holding a project config as the project
// root; the user config file has no project, so the working directory wins.
func discoverWorkdir(configPath string) string {
	if configPath == "" {
		return ""
	}
	dir := filepath.Dir(configPath)
	if strings.EqualFold(dir, global.Config()) {
		return ""
	}
	return dir
}

// resolveBaseData mirrors the core's data_dir resolution: an explicit data_dir
// in the config resolves next to the config file, otherwise the user data
// directory is used.
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
	}
	return global.Data()
}
