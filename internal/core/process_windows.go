//go:build windows

package core

import (
	"os/exec"
	"syscall"
)

// createNoWindow prevents Windows from allocating a console for the child.
const createNoWindow = 0x08000000

// hideChildWindow keeps the core from opening a console window when the
// desktop app spawns it.
func hideChildWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
}
