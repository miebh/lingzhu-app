package core

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestBoundClientSendsDirectory proves every workspace-scoped request names the
// directory it belongs to. One core serves several projects, so an unbound
// request would answer with the core's default workspace instead.
func TestBoundClientSendsDirectory(t *testing.T) {
	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.Query().Get("directory"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"sessions":[]}`))
	}))
	defer server.Close()

	client := New(server.URL).For("/projects/a")
	if _, err := client.Sessions(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Commands(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 2 || seen[0] != "/projects/a" || seen[1] != "/projects/a" {
		t.Fatalf("every request must carry the directory: %+v", seen)
	}
}

// TestUnboundClientAsksForTheDefault proves an unbound client still works, which
// is what a single-workspace core and its tests expect.
func TestUnboundClientAsksForTheDefault(t *testing.T) {
	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.Query().Get("directory"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"sessions":[]}`))
	}))
	defer server.Close()

	if _, err := New(server.URL).Sessions(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 1 || seen[0] != "" {
		t.Fatalf("an unbound client must not invent a directory: %+v", seen)
	}
}

// TestForKeepsTheSameCore proves binding a directory does not change the core a
// client talks to.
func TestForKeepsTheSameCore(t *testing.T) {
	base := New("http://127.0.0.1:1234")
	bound := base.For("/projects/a")
	if bound.BaseURL != base.BaseURL {
		t.Fatalf("binding must keep the core address: %q", bound.BaseURL)
	}
	if base.Directory != "" {
		t.Fatal("binding must not mutate the original client")
	}
}
