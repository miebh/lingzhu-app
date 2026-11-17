package core

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestEventsParsesSessionEnvelope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("event: user.message\n"))
		_, _ = w.Write([]byte(`data: {"sessionId":"s1","seq":3,"type":"user.message","at":"2026-11-04T00:00:00Z","data":{"text":"hi"}}` + "\n\n"))
	}))
	defer server.Close()

	var got []GlobalEvent
	err := New(server.URL).Events(context.Background(), func(event GlobalEvent) {
		got = append(got, event)
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].SessionID != "s1" || got[0].Type != "user.message" || got[0].Seq != 3 {
		t.Fatalf("unexpected events: %+v", got)
	}
	if got[0].At.IsZero() || got[0].At.After(time.Now()) {
		t.Fatalf("unexpected timestamp: %+v", got[0].At)
	}
}

func TestMessagesParsesCompactionCheckpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sessions/s1/messages" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"messages":[{"role":"user","content":"<conversation-checkpoint/>","compaction":true,"compactionCovered":4,"compactionReason":"manual"}]}`))
	}))
	defer server.Close()

	messages, err := New(server.URL).Messages(context.Background(), "s1")
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || !messages[0].Compaction || messages[0].CompactionCovered != 4 || messages[0].CompactionReason != "manual" {
		t.Fatalf("compaction checkpoint was not preserved: %+v", messages)
	}
}

func TestInputQueuesOrReportsNotRunning(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{name: "queued", status: http.StatusAccepted, body: `{"queued":true}`},
		{name: "closing", status: http.StatusConflict, body: `{"error":"session is not running"}`, want: ErrNotRunning},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/sessions/s1/input" {
					t.Errorf("unexpected path %s", r.URL.Path)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(test.status)
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()

			err := New(server.URL).Input(context.Background(), "s1", "hello")
			if !errors.Is(err, test.want) {
				t.Fatalf("Input error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestCommandsReadsSlashCommands(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/commands" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"commands":[{"name":"plugincmd","description":"Expand a plugin command","template":"COMMAND_MARKER {{args}}","plugin":"demo"}]}`))
	}))
	defer server.Close()

	commands, err := New(server.URL).Commands(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(commands) != 1 || commands[0].Name != "plugincmd" || commands[0].Plugin != "demo" {
		t.Fatalf("unexpected commands: %+v", commands)
	}
	if commands[0].Template != "COMMAND_MARKER {{args}}" {
		t.Fatalf("unexpected template: %q", commands[0].Template)
	}
}

func TestPromptWithMetaSendsReferences(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sessions/s1/prompt" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		var body struct {
			Text       string            `json:"text"`
			Comments   []PromptComment   `json:"comments"`
			References []PromptReference `json:"references"`
			Voice      bool              `json:"voice"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode body: %v", err)
		}
		if body.Text != "look" || len(body.Comments) != 1 || len(body.References) != 1 || !body.Voice {
			t.Errorf("unexpected meta body: %+v", body)
		}
		if body.References[0].Path != "/ws/a.go" || body.References[0].Name != "a.go" {
			t.Errorf("unexpected reference: %+v", body.References[0])
		}
		w.Header().Set("Content-Type", "text/event-stream")
	}))
	defer server.Close()

	err := New(server.URL).PromptWithMeta(context.Background(), "s1", "look", "", "", "", true, nil,
		[]PromptComment{{File: "a.go", Line: 2, Body: "fix this"}},
		[]PromptReference{{Name: "a.go", Mime: "text/plain", Path: "/ws/a.go"}}, true, func(Event) {})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSessionDiffReadsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sessions/s1/diff" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"base":"aaa","head":"bbb","diffs":[{"file":"a.txt","patch":"@@ -1 +1 @@\n-old\n+new","additions":1,"deletions":1,"status":"modified"}]}`))
	}))
	defer server.Close()

	diff, err := New(server.URL).SessionDiff(context.Background(), "s1")
	if err != nil {
		t.Fatal(err)
	}
	if diff.Base != "aaa" || diff.Head != "bbb" || len(diff.Diffs) != 1 || diff.Diffs[0].File != "a.txt" || diff.Diffs[0].Additions != 1 {
		t.Fatalf("unexpected session diff: %+v", diff)
	}
}
