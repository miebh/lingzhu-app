package service

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
	"github.com/wailsapp/wails/v3/pkg/services/notifications"

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
	// coreMu guards the single child process every workspace shares.
	coreMu sync.Mutex
	// restartMu serializes a manual restart against the crash supervisor, so
	// two replacements never race for the same data directory.
	restartMu sync.Mutex
	core      *core.Core
	order     []string
	spaces    map[string]*workspaceRuntime
	streams   map[string]*streamState
	feeds     map[string]context.CancelFunc
	tails     map[string]*tailState
	// placements caches which workspace owns a session, so the event stream
	// does not resolve the same session on every event.
	placementMu sync.Mutex
	placements  map[string]string
	// emitEvent is a test seam; production uses the Wails event emitter.
	emitEvent func(EventEnvelope)
	// emitCoreStatus is the lifecycle event seam, matching emitEvent.
	emitCoreStatus func(CoreStatus)
	// notifier raises desktop notifications; nil disables the channel.
	notifier *notifications.NotificationService
	// noticeOnce starts the toast worker; noticeQueue carries its pushes.
	noticeOnce  sync.Once
	noticeQueue chan noticeJob
	// watched is the conversation on screen; lastNotice is the session the most
	// recent toast reported, used when an activation arrives without its args.
	watcher    *noticeWatcher
	watchMu    sync.Mutex
	watched    NoticeTarget
	lastNotice NoticeTarget
	// noticeCopy is the webview's wording for a completion notice.
	noticeCopy NoticeCopy
	// pendingNotice is the session a cold-start toast click named; the webview
	// collects it after it subscribes.
	pendingNotice *NoticeTarget
	// startCoreFn is the supervisor's attach seam, so a restart can be driven
	// in a test without spawning a process.
	startCoreFn func(*workspaceRuntime) error
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
	DefaultWorkspace       string                          `json:"defaultWorkspace"`
	WorkspaceDestination   string                          `json:"workspaceDestination"`
	AutoApprove            bool                            `json:"autoApprove"`
	FollowUpBehavior       string                          `json:"followUpBehavior"`
	ShowAgent              bool                            `json:"showAgent"`
	ShowMessageAgent       bool                            `json:"showMessageAgent"`
	Spellcheck             bool                            `json:"spellcheck"`
	FoldUserMessages       bool                            `json:"foldUserMessages"`
	ShowTurnDiffs          bool                            `json:"showTurnDiffs"`
	BackgroundActivity     string                          `json:"backgroundActivity"`
	PinchZoom              bool                            `json:"pinchZoom"`
	NewIcons               bool                            `json:"newIcons"`
	NewQuestionUI          bool                            `json:"newQuestionUI"`
	Sounds                 SoundPreferences                `json:"sounds"`
	DefaultModel           ModelSelection                  `json:"defaultModel"`
	ProjectNames           map[string]string               `json:"projectNames"`
	ProjectIcons           map[string]string               `json:"projectIcons"`
	ProjectColors          map[string]string               `json:"projectColors"`
	ProjectWorktreeStartup map[string]string               `json:"projectWorktreeStartup"`
	ProjectAutoApprove     map[string]bool                 `json:"projectAutoApprove"`
	ProviderAccounts       map[string][]ProviderCredential `json:"providerAccounts"`
	ActiveProviderAccounts map[string]string               `json:"activeProviderAccounts"`
	FavoriteModels         []ModelSelection                `json:"favoriteModels"`
	RecentModels           []ModelSelection                `json:"recentModels"`
	PinnedSessions         []string                        `json:"pinnedSessions"`
	Appearance             AppearancePreferences           `json:"appearance"`
	Notifications          NotificationPreferences         `json:"notifications"`
	Keybinds               map[string]string               `json:"keybinds"`
}

// SoundPreferences chooses which session events play a short sound.
type SoundPreferences struct {
	Agent       bool              `json:"agent"`
	Permissions bool              `json:"permissions"`
	Questions   bool              `json:"questions"`
	Errors      bool              `json:"errors"`
	Interface   bool              `json:"interface"`
	Tones       map[string]string `json:"tones"`
}

// ProviderCredential is one named API-key credential for a provider.
type ProviderCredential struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Key  string `json:"key"`
}

// NotificationPreferences chooses which session events raise a notification.
type NotificationPreferences struct {
	Agent       bool `json:"agent"`
	Permissions bool `json:"permissions"`
	Questions   bool `json:"questions"`
	Errors      bool `json:"errors"`
}

// ModelSelection is the last used provider/model, shared by the whole app.
type ModelSelection struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

// AppearancePreferences controls the client look without touching core config.
type AppearancePreferences struct {
	FontFamily      string                     `json:"fontFamily"`
	CodeFont        string                     `json:"codeFont"`
	TerminalFont    string                     `json:"terminalFont"`
	ThemeName       string                     `json:"themeName"`
	Density         string                     `json:"density"`
	Zoom            int                        `json:"zoom"`
	TimelineWidth   string                     `json:"timelineWidth"`
	ReduceMotion    string                     `json:"reduceMotion"`
	Theme           string                     `json:"theme"`
	Language        string                     `json:"language"`
	TabLayout       string                     `json:"tabLayout"`
	SidebarOrganize string                     `json:"sidebarOrganize"`
	TimelineDetail  preferences.TimelineDetail `json:"timelineDetail"`
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
	defaultMaxSteps      = 0
	defaultContextWindow = 128000
	defaultCompactKeep   = 15000
)

func NewCoreService() *CoreService {
	service := &CoreService{
		spaces:     map[string]*workspaceRuntime{},
		streams:    map[string]*streamState{},
		feeds:      map[string]context.CancelFunc{},
		tails:      map[string]*tailState{},
		placements: map[string]string{},
		watcher:    newNoticeWatcher(),
	}
	// A cold start caused by clicking a toast carries the session in the launch
	// arguments; the webview collects it after it subscribes to events.
	if target, ok := NoticeFromArgs(os.Args[1:]); ok {
		service.pendingNotice = &target
	}
	return service
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

	prefs, err := preferences.Open(db)
	if err != nil {
		_ = db.Close()
		s.db = nil
		s.err = err.Error()
		return nil
	}
	s.prefs = prefs

	// Desktop notifications are optional: a machine without a bundle
	// identifier or with the channel blocked still runs the app.
	s.notifier = notifications.New()
	s.startNotifier(ctx, options)

	store, err := workspaces.Open(db)
	if err != nil {
		s.err = err.Error()
		return nil
	}
	s.store = store

	// Bring a gateway provider's model list up to date before any core starts,
	// so a model magpie added is usable on the first prompt instead of only
	// after a manual "sync models".
	s.syncGatewayConfig()

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

	// A build installed by a self-update has to prove it works: the installer's
	// watchdog rolls back unless this app confirms. Only a reachable core counts
	// as proof, so the check waits for one rather than trusting that the process
	// merely started.
	go s.confirmRunningBuild()
	return nil
}

// confirmRunningBuild writes the update confirmation once the core answers.
// The installer's watchdog waits a bounded time for it, so this must not block
// startup: it polls in the background and gives up quietly if no core ever
// comes up, which is the case the watchdog rolls back.
func (s *CoreService) confirmRunningBuild() {
	clearStaleUpdateState()
	if !updatePending() {
		return
	}
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		if s.ctx.Err() != nil {
			return
		}
		s.mu.Lock()
		shared := s.core
		s.mu.Unlock()
		if shared != nil {
			ctx, cancel := context.WithTimeout(s.ctx, 2*time.Second)
			err := shared.Client.Health(ctx)
			cancel()
			if err == nil {
				if err := confirmUpdate(); err != nil {
					fmt.Printf("confirm update: %v\n", err)
				}
				return
			}
		}
		select {
		case <-time.After(time.Second):
		case <-s.ctx.Done():
			return
		}
	}
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
	shared := s.core
	s.core = nil
	s.mu.Unlock()

	// One core serves every workspace, so it is stopped exactly once here.
	if shared != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		_ = shared.Stop(ctx)
		cancel()
	}
	if s.db != nil {
		_ = s.db.Close()
	}
	if s.notifier != nil {
		_ = s.notifier.ServiceShutdown()
		s.notifier = nil
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
	return s.AddWorkspaceAt(dir)
}

// AddWorkspaceAt registers an already resolved directory as a workspace.
func (s *CoreService) AddWorkspaceAt(path string) (WorkspaceInfo, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return WorkspaceInfo{}, err
	}
	abs = filepath.Clean(abs)

	s.mu.Lock()
	for existing := range s.spaces {
		if strings.EqualFold(existing, abs) {
			info := s.infoLocked(existing)
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

// RemoveWorkspace closes the workspace in the core and forgets the directory.
// Its session data stays on disk, and the other projects keep running because
// they share the same core process.
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
	for key, state := range s.tails {
		if strings.HasPrefix(key, prefix) {
			state.cancel()
			delete(s.tails, key)
		}
	}
	s.mu.Unlock()

	// Only the core's own workspace is closed. The process keeps serving the
	// remaining projects, so one removal never interrupts another.
	if runtime != nil && runtime.Core != nil && path != s.defaultRoot {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		_ = runtime.Core.Client.CloseLocation(ctx, path)
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

// startCore attaches one workspace to the shared core, starting it the first
// time any workspace is opened. Every project lives in that one process, so a
// second workspace is an extra location rather than another child process.
func (s *CoreService) startCore(runtime *workspaceRuntime) error {
	coreRuntime, err := s.ensureCore()
	if err != nil {
		return err
	}
	client := coreRuntime.Client
	if runtime.Path != s.defaultRoot {
		// The core starts on the default workspace; every other project is an
		// extra location that has to be opened before it can answer requests.
		probeCtx, cancel := context.WithTimeout(s.ctx, 30*time.Second)
		_, openErr := client.OpenLocation(probeCtx, runtime.Path)
		cancel()
		if openErr != nil {
			return fmt.Errorf("open workspace %s: %w", runtime.Path, openErr)
		}
	}
	s.mu.Lock()
	runtime.Core = coreRuntime
	runtime.Addr = coreRuntime.Addr
	runtime.Err = ""
	s.mu.Unlock()
	s.watchEvents(client)
	return nil
}

// ensureCore returns the one core this service owns, starting it on first use.
// It is the single place that spawns a child process.
func (s *CoreService) ensureCore() (*core.Core, error) {
	s.coreMu.Lock()
	defer s.coreMu.Unlock()
	if s.core != nil {
		return s.core, nil
	}

	// A core started by hand on the default address serves the default
	// workspace; reuse it instead of spawning a second one on the same data.
	handClient := core.New("http://" + core.DefaultAddr)
	probeCtx, cancel := context.WithTimeout(s.ctx, time.Second)
	handErr := handClient.Health(probeCtx)
	cancel()
	if handErr == nil {
		s.core = &core.Core{Client: handClient, Addr: core.DefaultAddr}
		return s.core, nil
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		// A core that is still shutting down keeps its data-directory lock for
		// a moment. Give it time before spawning the replacement, otherwise
		// every retry fails with "data directory ... is already in use".
		if attempt > 0 {
			select {
			case <-s.ctx.Done():
				return nil, s.ctx.Err()
			case <-time.After(time.Duration(attempt) * 300 * time.Millisecond):
			}
		}
		addr, err := freeAddr()
		if err != nil {
			return nil, err
		}
		info, err := core.Ensure(s.ctx, core.Options{
			Addr:    addr,
			Binary:  os.Getenv("LINGZHU_CORE"),
			Workdir: s.defaultRoot,
			DataDir: s.baseData,
			Config:  s.configPath,
		})
		if err == nil {
			s.core = info
			// A core that dies on its own must come back without the user
			// having to press "Restart core".
			s.superviseCore(info)
			return s.core, nil
		}
		lastErr = err
	}
	return nil, lastErr
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
	// Bind the workspace so every request names the directory it belongs to.
	// One core serves every project now, so an unbound request would answer
	// with the core's default workspace instead of the caller's.
	return runtime.Core.Client.For(runtime.Path), nil
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

// emitCore publishes a core lifecycle event through Wails unless a test seam
// replaced the emitter.
func (s *CoreService) emitCore(status CoreStatus) {
	if s.emitCoreStatus != nil {
		s.emitCoreStatus(status)
		return
	}
	if app := application.Get(); app != nil {
		app.Event.Emit(coreEventChannel, status)
	}
}

// watchEvents follows the one all-session stream this core exposes and
// reconnects after a dropped connection from the last position it saw, so the
// events written during the gap are replayed instead of lost. Every workspace
// shares this stream, because one core serves them all; a subscription per
// workspace would deliver each event once per project.
func (s *CoreService) watchEvents(client *core.Client) {
	s.mu.Lock()
	if s.feeds[""] != nil {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(s.ctx)
	s.feeds[""] = cancel
	s.mu.Unlock()

	go func() {
		var last int64
		for ctx.Err() == nil {
			err := client.EventsAfter(ctx, last, func(ev core.GlobalEvent) {
				if ev.Global > last {
					last = ev.Global
				}
				envelope := EventEnvelope{
					Workspace: s.workspaceOf(ev.SessionID, ev.Directory),
					SessionID: ev.SessionID,
					Seq:       ev.Seq,
					Type:      ev.Type,
					At:        ev.At,
					Data:      ev.Data,
				}
				s.emit(envelope)
				s.watchRun(envelope)
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

// watchRun raises the completion notice for a run that ended while the user
// was elsewhere. It runs off the event stream rather than the webview, because
// a minimised window lets WebView2 suspend its timers and the page would only
// notice the end of the run once the user came back.
func (s *CoreService) watchRun(ev EventEnvelope) {
	if ev.Type == "session.deleted" {
		s.watcher.forget(ev.SessionID)
		return
	}
	// Every event is offered to the watcher: it tracks the running state from
	// the starts so that only the transition into a settled run reports.
	s.watchMu.Lock()
	watched := s.watched
	s.watchMu.Unlock()
	focused := watched.SessionID != "" &&
		watched.SessionID == ev.SessionID &&
		watched.Workspace == ev.Workspace &&
		appFocused()

	notice, ok := s.watcher.observe(ev, focused)
	if !ok {
		return
	}
	if notice.Workspace == "" {
		notice.Workspace = ev.Workspace
	}
	if err := s.raiseNotice(notice); err != nil {
		logNotice("completion notice %s/%s: %v", notice.Workspace, notice.SessionID, err)
	}
}

// workspaceOf maps a session to the workspace that owns it. The core tags each
// event with the session's directory, so this never blocks the event stream on
// a second request; it only falls back when an older core omits the field.
func (s *CoreService) workspaceOf(sessionID, directory string) string {
	if directory != "" {
		s.placementMu.Lock()
		s.placements[sessionID] = directory
		s.placementMu.Unlock()
		return directory
	}

	s.mu.Lock()
	coreRuntime := s.core
	known := make([]string, len(s.order))
	copy(known, s.order)
	s.mu.Unlock()
	if len(known) == 0 {
		return ""
	}
	if len(known) == 1 || coreRuntime == nil {
		return known[0]
	}

	s.placementMu.Lock()
	cached, ok := s.placements[sessionID]
	s.placementMu.Unlock()
	if ok {
		return cached
	}

	ctx, cancel := context.WithTimeout(s.ctx, 2*time.Second)
	defer cancel()
	location, err := coreRuntime.Client.Location(ctx, sessionID)
	if err != nil || strings.TrimSpace(location.Directory) == "" {
		return known[0]
	}
	s.placementMu.Lock()
	s.placements[sessionID] = location.Directory
	s.placementMu.Unlock()
	return location.Directory
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
