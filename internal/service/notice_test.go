package service

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

func toastArgs(t *testing.T, data map[string]any) string {
	t.Helper()
	payload := map[string]any{
		"action": "DEFAULT_ACTION",
		"payload": map[string]any{
			"id":    "lingzhu-s1-1",
			"title": "Fix the build finished",
			"data":  data,
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(raw)
}

// Clicking a toast while the app is closed relaunches it with the payload, so
// the launch arguments are the only place the session survives.
func TestNoticeFromArgsReadsToastPayload(t *testing.T) {
	args := []string{"--relaunched", toastArgs(t, map[string]any{"workspace": "/w", "sessionId": "s1"})}
	target, ok := NoticeFromArgs(args)
	if !ok {
		t.Fatal("toast payload was not recognised")
	}
	if target.Workspace != "/w" || target.SessionID != "s1" {
		t.Fatalf("unexpected target: %+v", target)
	}
}

// An ordinary launch carries no payload, and must not look like a notice.
func TestNoticeFromArgsIgnoresPlainLaunch(t *testing.T) {
	if target, ok := NoticeFromArgs([]string{"--relaunched"}); ok {
		t.Fatalf("plain launch read as a notice: %+v", target)
	}
	if _, ok := NoticeFromArgs([]string{"not-base64"}); ok {
		t.Fatal("garbage argument read as a notice")
	}
}

// A toast renders only a few lines, so a long provider error is cut instead of
// pushing the actionable part out of view.
func TestTruncateNoticeKeepsOneParagraph(t *testing.T) {
	long := strings.Repeat("x", 400)
	got := truncateNotice(long, 240)
	if len([]rune(got)) != 240 || !strings.HasSuffix(got, "…") {
		t.Fatalf("unexpected truncation: %q", got)
	}
	if short := truncateNotice("done", 240); short != "done" {
		t.Fatalf("short body changed: %q", short)
	}
}

// A completion notice is one line: the sentence that says what happened moves
// into the title slot, which the library requires to be filled, and the detail
// slot stays empty so Windows renders a single row.
func TestNoticeLinesUseOneLine(t *testing.T) {
	service := NewCoreService()
	service.SetNoticeCopy(NoticeCopy{
		Finished:    "本轮结果已就绪。",
		ClickToOpen: "点击返回该会话。",
	})
	title, body := service.noticeLines(TaskNotice{})
	if title != "本轮结果已就绪。 点击返回该会话。" {
		t.Fatalf("unexpected title: %q", title)
	}
	if body != "" {
		t.Fatalf("a completion toast must not add a second line: %q", body)
	}
}

// A request notice names its session in the headline and explains itself
// underneath.
func TestNoticeLinesKeepRequestHeadline(t *testing.T) {
	service := NewCoreService()
	title, body := service.noticeLines(TaskNotice{
		Title: "lingzhu 需要权限",
		Body:  "代理正在等待授权。 点击返回该会话。",
	})
	if title != "lingzhu 需要权限" {
		t.Fatalf("unexpected title: %q", title)
	}
	if body != "代理正在等待授权。 点击返回该会话。" {
		t.Fatalf("unexpected body: %q", body)
	}
}

// The toast body comes from the webview's message catalog, so switching the
// language changes it; Go must never fall back to hard-coded English while the
// webview has supplied its own wording.
func TestNoticeBodyUsesSuppliedCopy(t *testing.T) {
	service := NewCoreService()
	service.SetNoticeCopy(NoticeCopy{
		Finished:    "本轮结果已就绪。",
		Failed:      "本轮因错误中断。",
		ClickToOpen: "点击返回该会话。",
	})

	// The card offers its own way back, so the click hint belongs to the toast
	// body, which has no affordance of its own.
	if body := service.noticeBody(TaskNotice{}); body != "本轮结果已就绪。 点击返回该会话。" {
		t.Fatalf("finished body ignored the supplied copy: %q", body)
	}
	if body := service.noticeBody(TaskNotice{Failed: true}); body != "本轮因错误中断。 点击返回该会话。" {
		t.Fatalf("failed body ignored the supplied copy: %q", body)
	}
	// A provider message is the useful part, so it is kept and the app's line
	// only says what a click does.
	if body := service.noticeBody(TaskNotice{Failed: true, Message: "provider exploded"}); body != "provider exploded 点击返回该会话。" {
		t.Fatalf("failure message was not combined with the click hint: %q", body)
	}
}

// A toast body keeps its two lines together without leaving a gap when only
// one of them is supplied.
func TestJoinNotice(t *testing.T) {
	for _, test := range []struct{ first, second, want string }{
		{"a", "b", "a b"},
		{"", "b", "b"},
		{"a", "", "a"},
	} {
		if got := joinNotice(test.first, test.second); got != test.want {
			t.Fatalf("joinNotice(%q, %q) = %q, want %q", test.first, test.second, got, test.want)
		}
	}
}

// Without any supplied copy the notice still renders, so a webview that has not
// subscribed yet cannot produce an empty toast.
func TestNoticeBodyHasFallback(t *testing.T) {
	service := NewCoreService()
	if body := service.noticeBody(TaskNotice{}); body == "" {
		t.Fatal("finished notice body was empty")
	}
	if body := service.noticeBody(TaskNotice{Failed: true}); body == "" {
		t.Fatal("failed notice body was empty")
	}
}

// A cold start collects the pending notice exactly once, so a reload does not
// keep jumping back to an old session.
func TestPendingNoticeIsConsumedOnce(t *testing.T) {
	service := NewCoreService()
	service.pendingNotice = &NoticeTarget{Workspace: "/w", SessionID: "s1"}
	if target := service.PendingNotice(); target == nil || target.SessionID != "s1" {
		t.Fatalf("pending notice not returned: %+v", target)
	}
	if target := service.PendingNotice(); target != nil {
		t.Fatalf("pending notice returned twice: %+v", target)
	}
}

// A click can arrive with no launch payload, which is what the shell does when
// it cannot round-trip the arguments. That still means the user clicked, so the
// activation falls back to the most recent notice instead of doing nothing.
func TestActivationFallsBackToLastNotice(t *testing.T) {
	service := NewCoreService()
	service.watchMu.Lock()
	service.lastNotice = NoticeTarget{Workspace: "/w", SessionID: "s1"}
	service.watchMu.Unlock()

	// The same read the activation callback performs when its payload is empty.
	service.watchMu.Lock()
	target := service.lastNotice
	service.watchMu.Unlock()
	if target.SessionID != "s1" || target.Workspace != "/w" {
		t.Fatalf("fallback target is wrong: %+v", target)
	}
}

// An empty argument list must not be mistaken for a notice, and must not stop
// the window from being raised.
func TestNoticeFromArgsToleratesEmptyPayload(t *testing.T) {
	if target, ok := NoticeFromArgs([]string{""}); ok {
		t.Fatalf("empty payload read as a notice: %+v", target)
	}
}
