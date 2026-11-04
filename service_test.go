package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"lingzhu-app/internal/core"
)

func TestInfoReportsAppDatabase(t *testing.T) {
	service := &CoreService{appDBPath: "C:/app/app.db"}
	if got := service.Info().DatabasePath; got != "C:/app/app.db" {
		t.Fatalf("unexpected database path: %q", got)
	}
}

func TestStreamTurnQueuesWhenPromptBusy(t *testing.T) {
	var prompts, inputs atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/sessions/s1/prompt":
			prompts.Add(1)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_, _ = w.Write([]byte(`{"error":"session is already running"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/sessions/s1/input":
			inputs.Add(1)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusAccepted)
			_, _ = w.Write([]byte(`{"queued":true}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	service := NewCoreService()
	service.ctx = context.Background()
	var events []EventEnvelope
	service.emitEvent = func(event EventEnvelope) {
		events = append(events, event)
	}
	client := core.New(server.URL)
	key := streamKey("/ws", "s1")
	state := &streamState{cancel: func() {}, done: make(chan struct{})}
	service.streams[key] = state

	service.streamTurn(client, "/ws", "s1", "steer this run", "", "", key, context.Background(), state)

	if got := prompts.Load(); got != 1 {
		t.Fatalf("prompt calls = %d, want 1", got)
	}
	if got := inputs.Load(); got != 1 {
		t.Fatalf("input calls = %d, want 1", got)
	}
	if len(events) != 0 {
		t.Fatalf("busy prompt must not emit client.done/client.error: %+v", events)
	}
	if _, ok := service.streams[key]; ok {
		t.Fatal("stream state was not removed")
	}
	select {
	case <-state.done:
	default:
		t.Fatal("stream done channel was not closed")
	}
}
