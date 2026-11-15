//go:build windows

// Package detach starts processes that must outlive the app: the installer that
// replaces the running binaries, and the relaunch helper that brings the app
// back afterwards.
package detach

import (
	"errors"
	"os/exec"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

// createBreakawayFromJob lets the child leave this process's job object. A
// shell command's children are wrapped in a job that is killed when the core
// exits, so without breakaway an installer would die halfway through the
// update.
const createBreakawayFromJob = 0x01000000

// createNewProcessGroup keeps the child out of this process's console group.
const createNewProcessGroup = 0x00000200

// createNoWindow starts a console program without allocating a console.
// DETACHED_PROCESS is deliberately not used: a console host such as PowerShell
// fails to start at all without one.
const createNoWindow = 0x08000000

// Launch starts cmd detached. It returns once the process exists; the caller
// never learns its exit status.
//
// CREATE_BREAKAWAY_FROM_JOB is rejected with access denied when the enclosing
// job does not allow breakaway, which happens when another host started this
// process inside its own job. The launch then falls back to a plain detached
// start so the update still runs, even if the enclosing job can still end it.
func Launch(cmd *exec.Cmd) error {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags |= createBreakawayFromJob | createNoWindow | createNewProcessGroup
	cmd.SysProcAttr.HideWindow = true
	err := cmd.Start()
	if err == nil || !errors.Is(err, windows.ERROR_ACCESS_DENIED) {
		return err
	}
	cmd.SysProcAttr.CreationFlags &^= createBreakawayFromJob
	return cmd.Start()
}

// WaitForExit reports whether the process with pid is gone within timeout.
func WaitForExit(pid int, timeout time.Duration) bool {
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return true
	}
	defer windows.CloseHandle(handle)
	status, err := windows.WaitForSingleObject(handle, uint32(timeout/time.Millisecond))
	return err == nil && status == uint32(windows.WAIT_OBJECT_0)
}
