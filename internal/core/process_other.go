//go:build !windows

package core

import "os/exec"

// hideChildWindow is a no-op outside Windows.
func hideChildWindow(cmd *exec.Cmd) {}
