//go:build !windows

package detach

import (
	"os/exec"
	"syscall"
	"time"
)

// Launch starts cmd in a session of its own, so it survives this process
// exiting and never receives the group's signals.
func Launch(cmd *exec.Cmd) error {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setsid = true
	return cmd.Start()
}

// WaitForExit reports whether the process with pid is gone within timeout.
func WaitForExit(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if syscall.Kill(pid, 0) != nil {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return syscall.Kill(pid, 0) != nil
}
