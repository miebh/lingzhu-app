package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

// errToastQueueFull reports a backlog of unsent notifications instead of
// blocking the caller on a stalled toast service.
var errToastQueueFull = errors.New("desktop notification queue is full")

// noticeChannel tells the webview which session a clicked desktop notification
// belongs to, so a click returns to the app on that conversation instead of
// only raising the window.
const noticeChannel = "lingzhu:notice"

// NoticeCopy is the wording of a completion notice, supplied by the webview so
// the message catalog stays the single source of user-facing text.
type NoticeCopy struct {
	Finished    string `json:"finished"`
	Failed      string `json:"failed"`
	ClickToOpen string `json:"clickToOpen"`
}

// NoticeTarget names the session a notification was raised for.
type NoticeTarget struct {
	Workspace string `json:"workspace"`
	SessionID string `json:"sessionId"`
}

// TaskNotice is one completion notification the app shows outside its window.
// It carries facts, not copy: the body text belongs to the webview, which is
// the only place that knows the user's language.
type TaskNotice struct {
	Workspace string `json:"workspace"`
	SessionID string `json:"sessionId"`
	// Title is a headline supplied by the caller. A completion notice leaves it
	// empty: the toast shows one line, which is the body.
	Title string `json:"title"`
	// Failed marks a run that stopped with an error.
	Failed bool `json:"failed"`
	// Message is the provider's own error text, already in the user's language
	// when the provider wrote it there.
	Message string `json:"message"`
	// Body is ready-made copy, used only by callers that supply their own
	// translation.
	Body string `json:"body"`
}

// noticeJob is one queued toast plus the channel that reports its outcome.
type noticeJob struct {
	options notifications.NotificationOptions
	result  chan error
}

// startNotifier brings the platform notifier up. A machine that cannot show
// toasts (no bundle identifier, notifications disabled by policy) must keep
// the app usable, so a failure only disables this channel.
func (s *CoreService) startNotifier(ctx context.Context, options application.ServiceOptions) {
	if s.notifier == nil {
		return
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			logNotice("notifier disabled: %v", recovered)
			s.notifier = nil
		}
	}()
	if err := s.notifier.ServiceStartup(ctx, options); err != nil {
		// Startup writes the registry data first and registers the in-process
		// activation callback last. A failure therefore costs the callback,
		// not delivery: the toast click relaunches this executable with the
		// payload instead, which `NoticeFromArgs` reads.
		logNotice("activation callback unavailable: %v", err)
		return
	}
	logNotice("notifier started")
	s.notifier.OnNotificationResponse(func(result notifications.NotificationResult) {
		// The shell can activate the callback with no usable arguments; that
		// still means the user clicked the toast, so the window must come
		// forward. Only the session jump depends on the payload.
		if result.Error != nil {
			logNotice("notification response error: %v", result.Error)
		}
		target := noticeTargetOf(result.Response.UserInfo)
		if target.SessionID == "" {
			// Fall back to the toast this app raised most recently: a click is
			// about that run, and landing there beats landing nowhere.
			s.watchMu.Lock()
			target = s.lastNotice
			s.watchMu.Unlock()
			logNotice("activation without payload, using last notice: %s/%s", target.Workspace, target.SessionID)
		} else {
			logNotice("notification clicked: %s/%s", target.Workspace, target.SessionID)
		}
		if target.SessionID != "" {
			// Kept even when the window is up, so a page that reloads after the
			// click still lands on the session.
			s.mu.Lock()
			s.pendingNotice = &target
			s.mu.Unlock()
		}
		raiseWithRetry()
		if target.SessionID != "" {
			EmitNotice(target)
		}
	})
}

// raiseWithRetry brings the window forward, retrying briefly because a click
// that started this process arrives before the window exists.
func raiseWithRetry() {
	FocusMainWindow()
	go func() {
		for i := 0; i < 10; i++ {
			time.Sleep(200 * time.Millisecond)
			if appFocused() {
				return
			}
			FocusMainWindow()
		}
	}()
}

// SetNoticeCopy records the words the webview uses for a completion notice, so
// a toast raised from the event stream is written in the user's language. The
// webview owns the message catalog; Go only stores what it was handed.
func (s *CoreService) SetNoticeCopy(copy NoticeCopy) {
	s.watchMu.Lock()
	s.noticeCopy = copy
	s.watchMu.Unlock()
}

// noticeBody renders the body of a completion notice in the current language.
// It is the toast's only line, so it carries both what happened and what a
// click does.
func (s *CoreService) noticeBody(notice TaskNotice) string {
	s.watchMu.Lock()
	copy := s.noticeCopy
	s.watchMu.Unlock()
	if notice.Body != "" {
		return notice.Body
	}
	if notice.Failed {
		if notice.Message != "" {
			// The provider's text is the useful part; the app's own line says
			// what a click does.
			return joinNotice(notice.Message, copy.ClickToOpen)
		}
		if copy.Failed != "" {
			return joinNotice(copy.Failed, copy.ClickToOpen)
		}
		return "The run stopped with an error."
	}
	if copy.Finished != "" {
		// The in-app card already offers a way back, so the click hint is only
		// needed by the toast, which has no affordance of its own.
		return joinNotice(copy.Finished, copy.ClickToOpen)
	}
	return "The run finished. Click to return to the session."
}

// joinNotice puts two lines on one row without leaving a gap when one of them
// is missing.
func joinNotice(first, second string) string {
	if first == "" {
		return second
	}
	if second == "" {
		return first
	}
	return first + " " + second
}

// noticeTargetOf reads the session a toast was raised for. A toast from an
// older build carries no data, and must still focus the window.
func noticeTargetOf(userInfo map[string]any) NoticeTarget {
	target := NoticeTarget{}
	if value, ok := userInfo["workspace"].(string); ok {
		target.Workspace = value
	}
	if value, ok := userInfo["sessionId"].(string); ok {
		target.SessionID = value
	}
	return target
}

// NotifyTask raises a desktop notification for a finished run. Clicking it
// focuses the app and reopens the session, so the notification is a way back
// into the conversation rather than a dead-end banner. A failure is returned so
// the caller can fall back to its own card instead of dropping the report.
func (s *CoreService) NotifyTask(notice TaskNotice) error {
	if s.notifier == nil {
		return fmt.Errorf("desktop notifications are unavailable")
	}
	return s.raiseNotice(notice)
}

// noticeLines fills the two text slots a toast carries. A completion notice is
// a single line, and the library insists that line be the title, so its
// sentence goes there and the detail slot stays empty.
func (s *CoreService) noticeLines(notice TaskNotice) (title, body string) {
	line := truncateNotice(s.noticeBody(notice), 240)
	if notice.Title == "" {
		return line, ""
	}
	return notice.Title, line
}

// raiseNotice pushes one completion notice. The toast shows a single line, and
// the library insists that line be the title, so a completion notice leaves the
// headline empty and its sentence becomes the title. A request notice the
// webview raises supplies its own headline, which keeps its detail line.
func (s *CoreService) raiseNotice(notice TaskNotice) error {
	// Remember the session, so an activation that arrives without its launch
	// arguments can still land on the run the user clicked.
	if notice.SessionID != "" {
		s.watchMu.Lock()
		s.lastNotice = NoticeTarget{Workspace: notice.Workspace, SessionID: notice.SessionID}
		s.watchMu.Unlock()
	}
	title, body := s.noticeLines(notice)
	return s.pushNotice(notifications.NotificationOptions{
		ID:    "lingzhu-" + notice.SessionID + "-" + strconv.FormatInt(time.Now().UnixNano(), 10),
		Title: title,
		Body:  body,
		// No ThreadID: Windows renders it as a header whose title would be the
		// raw session id, which reads as noise above the message.
		Data: map[string]any{
			"workspace": notice.Workspace,
			"sessionId": notice.SessionID,
		},
		// The app plays its own tone for the event, so the toast stays silent
		// and the user hears one sound instead of two.
		Sound: &notifications.NotificationSound{Silent: true},
	})
}

// SetWatchedSession records which conversation the user is looking at. The
// completion watcher needs it because a run that ends in the session on screen
// is already explained by the transcript.
func (s *CoreService) SetWatchedSession(workspace, sessionID string) {
	s.watchMu.Lock()
	s.watched = NoticeTarget{Workspace: workspace, SessionID: sessionID}
	s.watchMu.Unlock()
}

// truncateNotice keeps a toast body to one readable paragraph. A toast renders
// a handful of lines, and a provider error can be far longer than that.
func truncateNotice(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit-1]) + "\u2026"
}

// EmitNotice tells the webview which session a clicked notification belongs to.
func EmitNotice(target NoticeTarget) {
	if app := application.Get(); app != nil {
		app.Event.Emit(noticeChannel, target)
	}
}

// PendingNotice returns the session named by the launch that started this
// process, if the process was started by clicking a toast while the app was
// closed. The webview asks once it has subscribed, so a cold start still lands
// on the session the notification reported on.
func (s *CoreService) PendingNotice() *NoticeTarget {
	s.mu.Lock()
	defer s.mu.Unlock()
	target := s.pendingNotice
	s.pendingNotice = nil
	return target
}

// NoticeFromArgs reads the session out of a toast activation argument. A toast
// whose click starts the app passes its payload as a launch argument, so the
// session survives even though no process was running to receive the callback.
func NoticeFromArgs(args []string) (NoticeTarget, bool) {
	for _, arg := range args {
		raw, err := base64.StdEncoding.DecodeString(arg)
		if err != nil {
			continue
		}
		var payload struct {
			Payload struct {
				Data map[string]any `json:"data"`
			} `json:"payload"`
		}
		if err := json.Unmarshal(raw, &payload); err != nil {
			continue
		}
		target := noticeTargetOf(payload.Payload.Data)
		if target.SessionID == "" {
			continue
		}
		logNotice("toast activation for %s/%s", target.Workspace, target.SessionID)
		return target, true
	}
	return NoticeTarget{}, false
}

// FocusMainWindow restores and raises the app window. It is shared by the
// second-instance handler and by a clicked desktop notification, so both paths
// bring the same window forward.
func FocusMainWindow() {
	// A toast click arrives at a background process, which Windows will not
	// let take the foreground on its own; the native path borrows the input
	// queue so the raise actually lands instead of only flashing the taskbar.
	raiseMainWindow()

	app := application.Get()
	if app == nil || app.Window == nil {
		return
	}
	windows := app.Window.GetAll()
	if len(windows) == 0 {
		return
	}
	// The framework still has to know the window is visible and focused so the
	// page resumes and the transcript can scroll.
	windows[0].Show()
	windows[0].Focus()
}

// appFocused reports whether the user is looking at the app right now. A
// minimised or hidden window counts as unfocused, so a run that ends while the
// user is elsewhere still reports.
func appFocused() bool {
	app := application.Get()
	if app == nil || app.Window == nil {
		return false
	}
	windows := app.Window.GetAll()
	if len(windows) == 0 {
		return false
	}
	return windows[0].IsFocused()
}
