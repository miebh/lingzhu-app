package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"lingzhu-app/internal/core"
)

// TestWorkspacesListsRegisteredProjectsBeforeAnyCore proves the window can show
// every saved project while the core is still coming up: startup only registers
// the workspaces, so the list must already carry them and mark them starting.
func TestWorkspacesListsRegisteredProjectsBeforeAnyCore(t *testing.T) {
	service := NewCoreService()
	service.register("/a")
	service.register("/b")

	list := service.Workspaces()
	if len(list) != 2 {
		t.Fatalf("workspaces = %d, want 2", len(list))
	}
	for _, item := range list {
		if !item.Starting {
			t.Fatalf("%s is not reported as starting", item.Path)
		}
		// A request for a starting workspace waits for the attach instead of
		// failing, so the frontend may treat it as usable straight away.
		if !item.Connected {
			t.Fatalf("%s must count as connected while starting", item.Path)
		}
	}
}

// TestClientWaitsForFirstAttach proves a request that arrives during the cold
// start blocks until the workspace is attached, instead of answering with
// "workspace core is not running" and making the window look broken.
func TestClientWaitsForFirstAttach(t *testing.T) {
	service := NewCoreService()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service.ctx = ctx
	runtime := service.register("/w")

	attached := make(chan error, 1)
	go func() {
		time.Sleep(50 * time.Millisecond)
		service.mu.Lock()
		runtime.Core = &core.Core{Client: core.New("http://127.0.0.1:1")}
		runtime.starting = false
		runtime.settle()
		service.mu.Unlock()
		attached <- nil
	}()

	client, err := service.client("/w")
	if err != nil {
		t.Fatalf("client during startup: %v", err)
	}
	if client == nil {
		t.Fatal("client during startup is nil")
	}
	if err := <-attached; err != nil {
		t.Fatal(err)
	}
}

// TestClientReportsAttachFailure proves a failed attach still answers the
// waiting request with the real reason instead of hanging.
func TestClientReportsAttachFailure(t *testing.T) {
	service := NewCoreService()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service.ctx = ctx
	runtime := service.register("/w")

	go func() {
		time.Sleep(20 * time.Millisecond)
		service.mu.Lock()
		runtime.Err = "core not found"
		runtime.starting = false
		runtime.settle()
		service.mu.Unlock()
	}()

	if _, err := service.client("/w"); err == nil || err.Error() != "core not found" {
		t.Fatalf("client error = %v, want the attach failure", err)
	}
}

// TestClientStopsWaitingWhenRemoved proves a workspace deleted mid-start wakes
// its waiters instead of leaving them blocked forever.
func TestClientStopsWaitingWhenRemoved(t *testing.T) {
	service := NewCoreService()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service.ctx = ctx
	service.register("/w")

	done := make(chan error, 1)
	go func() {
		_, err := service.client("/w")
		done <- err
	}()

	time.Sleep(20 * time.Millisecond)
	service.mu.Lock()
	runtime := service.spaces["/w"]
	delete(service.spaces, "/w")
	runtime.settle()
	service.mu.Unlock()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("a removed workspace must not resolve a client")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("client stayed blocked after the workspace was removed")
	}
}

// TestRestartBeginsStartForEveryWorkspace proves a restart marks the workspaces
// as attaching again, so requests that arrive while the old process exits wait
// for the replacement.
func TestRestartBeginsStartForEveryWorkspace(t *testing.T) {
	service := NewCoreService()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service.ctx = ctx
	runtime := service.register("/w")
	runtime.Core = &core.Core{}
	runtime.starting = false
	runtime.settle()

	runtime.beginStart()
	if !runtime.starting {
		t.Fatal("beginStart did not mark the workspace as starting")
	}
	select {
	case <-runtime.ready:
		t.Fatal("beginStart must hand out a fresh ready channel")
	default:
	}
}

// TestAttachRecordsFailureAndWakesWaiters proves the shared attach wrapper
// leaves the workspace settled with the error, which is what every request and
// the workspace list read.
func TestAttachRecordsFailureAndWakesWaiters(t *testing.T) {
	service := NewCoreService()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service.ctx = ctx
	runtime := service.register("/w")
	service.startCoreFn = func(*workspaceRuntime) error { return errors.New("boom") }

	if err := service.attach(runtime); err == nil {
		t.Fatal("attach reported no error")
	}
	service.mu.Lock()
	starting, recorded := runtime.starting, runtime.Err
	service.mu.Unlock()
	if starting {
		t.Fatal("attach left the workspace starting")
	}
	if recorded != "boom" {
		t.Fatalf("recorded error = %q, want boom", recorded)
	}
	select {
	case <-runtime.ready:
	default:
		t.Fatal("attach did not wake the waiting requests")
	}
}
