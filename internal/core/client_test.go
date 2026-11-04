package core

import (
	"context"
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
