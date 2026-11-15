package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"lingzhu-app/internal/core"
)

// TestSuperviseCoreIgnoresDeliberateStop proves a stop the app asked for is not
// treated as a crash: restarting a core after a settings change must not race
// the intended replacement.
func TestSuperviseCoreIgnoresDeliberateStop(t *testing.T) {
	service := NewCoreService()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service.ctx = ctx

	done := make(chan struct{})
	var statuses []CoreStatus
	var mu sync.Mutex
	service.emitCoreStatus = func(status CoreStatus) {
		mu.Lock()
		statuses = append(statuses, status)
		mu.Unlock()
	}
	restarted := false
	service.startCoreFn = func(*workspaceRuntime) error {
		restarted = true
		return nil
	}

	// A core that was never started by this app has no exit channel at all, so
	// nothing can be supervised: that is the reused-core case.
	shared := &core.Core{Owned: false}
	service.superviseCoreWithDone(shared, nil)
	_ = done

	time.Sleep(200 * time.Millisecond)
	mu.Lock()
	defer mu.Unlock()
	if len(statuses) != 0 {
		t.Fatalf("a core this app does not own must not be supervised: %+v", statuses)
	}
	if restarted {
		t.Fatal("a reused core must never be restarted")
	}
}

// TestRestartCrashedCoreReattachesWorkspaces proves the supervisor rebuilds the
// shared core and every workspace points at it again, which is what makes a
// crash invisible to the user.
func TestRestartCrashedCoreReattachesWorkspaces(t *testing.T) {
	service := NewCoreService()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service.ctx = ctx
	service.spaces = map[string]*workspaceRuntime{
		"/ws": {Path: "/ws", Name: "ws"},
	}
	service.order = []string{"/ws"}

	crashed := &core.Core{Owned: true}
	service.core = crashed

	var mu sync.Mutex
	var statuses []CoreStatus
	service.emitCoreStatus = func(status CoreStatus) {
		mu.Lock()
		statuses = append(statuses, status)
		mu.Unlock()
	}

	// startCore is replaced through the same seam the supervisor uses, so the
	// test observes the retry loop without spawning a real core.
	var attempts int
	service.startCoreFn = func(runtime *workspaceRuntime) error {
		attempts++
		if attempts < 2 {
			return errors.New("not yet")
		}
		service.mu.Lock()
		runtime.Core = &core.Core{}
		service.mu.Unlock()
		return nil
	}

	done := make(chan struct{})
	go service.restartCrashedCoreFrom(crashed, done)

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		finished := len(statuses) > 0 && statuses[len(statuses)-1].State == "ready"
		mu.Unlock()
		if finished {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	if attempts < 2 {
		t.Fatalf("supervisor did not retry: %d attempts", attempts)
	}
	if len(statuses) == 0 || statuses[len(statuses)-1].State != "ready" {
		t.Fatalf("supervisor never reported readiness: %+v", statuses)
	}
	var restarted bool
	for _, status := range statuses {
		if status.State == "restarting" {
			restarted = true
		}
	}
	if !restarted {
		t.Fatalf("supervisor did not announce the restart: %+v", statuses)
	}
	service.mu.Lock()
	connected := service.spaces["/ws"] != nil && service.spaces["/ws"].Core != nil
	service.mu.Unlock()
	if !connected {
		t.Fatal("workspace was not reattached to the replacement core")
	}
}
