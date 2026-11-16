//go:build windows

package service

import (
	"syscall"
	"unsafe"
)

// The window is raised from two very different contexts: a second launch, where
// the process already has foreground permission, and a toast click, which the
// shell hands to a background process. Windows only lets a process take the
// foreground if it already owns it, received the last input, or was started by
// the foreground process — a toast click is none of those, so a bare
// SetForegroundWindow only flashes the taskbar button. Attaching to the
// foreground thread's input queue is the documented way around that.

var (
	user32 = syscall.NewLazyDLL("user32.dll")
	kernel = syscall.NewLazyDLL("kernel32.dll")

	procEnumWindows         = user32.NewProc("EnumWindows")
	procGetWindowThreadPID  = user32.NewProc("GetWindowThreadProcessId")
	procIsWindowVisible     = user32.NewProc("IsWindowVisible")
	procIsIconic            = user32.NewProc("IsIconic")
	procShowWindow          = user32.NewProc("ShowWindow")
	procBringWindowToTop    = user32.NewProc("BringWindowToTop")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procGetForegroundWindow = user32.NewProc("GetForegroundWindow")
	procAttachThreadInput   = user32.NewProc("AttachThreadInput")
	procSetWindowPos        = user32.NewProc("SetWindowPos")
	procGetWindow           = user32.NewProc("GetWindow")
	procGetWindowTextLength = user32.NewProc("GetWindowTextLengthW")
	procGetCurrentProcessID = kernel.NewProc("GetCurrentProcessId")
	procGetCurrentThreadID  = kernel.NewProc("GetCurrentThreadId")
)

const (
	swRestore = 9
	swShow    = 5

	gwOwner = 4

	hwndTopmost    = ^uintptr(0)     // (HWND)-1
	hwndNotTopmost = ^uintptr(1) - 1 // (HWND)-2

	swpNoSize     = 0x0001
	swpNoMove     = 0x0002
	swpShowWindow = 0x0040
)

// raiseMainWindow restores and focuses this process's main window. It reports
// whether a window was found, so the caller can fall back to the framework.
func raiseMainWindow() bool {
	hwnd := findMainWindow()
	if hwnd == 0 {
		return false
	}
	if iconic, _, _ := procIsIconic.Call(hwnd); iconic != 0 {
		procShowWindow.Call(hwnd, swRestore)
	} else {
		procShowWindow.Call(hwnd, swShow)
	}

	// Take the foreground by borrowing the current owner's input queue, which
	// is what lets a background process satisfy the foreground rule.
	foreground, _, _ := procGetForegroundWindow.Call()
	if foreground != 0 && foreground != hwnd {
		ownerThread, _, _ := procGetWindowThreadPID.Call(foreground)
		currentThread, _, _ := procGetCurrentThreadID.Call()
		procAttachThreadInput.Call(currentThread, ownerThread, 1)
		procBringWindowToTop.Call(hwnd)
		procSetForegroundWindow.Call(hwnd)
		procAttachThreadInput.Call(currentThread, ownerThread, 0)
	} else {
		procBringWindowToTop.Call(hwnd)
		procSetForegroundWindow.Call(hwnd)
	}

	if current, _, _ := procGetForegroundWindow.Call(); current == hwnd {
		return true
	}

	// Still behind another window: a topmost round trip forces the window
	// manager to restack it, which the foreground call can then complete.
	flags := uintptr(swpNoMove | swpNoSize | swpShowWindow)
	procSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0, flags)
	procSetWindowPos.Call(hwnd, hwndNotTopmost, 0, 0, 0, 0, flags)
	procBringWindowToTop.Call(hwnd)
	procSetForegroundWindow.Call(hwnd)
	current, _, _ := procGetForegroundWindow.Call()
	return current == hwnd
}

// findMainWindow locates the app's own top-level window. The framework does not
// expose a native handle, so the window is matched by process id, visibility,
// a title, and the absence of an owner (owned windows are dialogs).
func findMainWindow() uintptr {
	pid, _, _ := procGetCurrentProcessID.Call()
	var found uintptr
	callback := syscall.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		var windowPID uintptr
		procGetWindowThreadPID.Call(hwnd, uintptr(unsafe.Pointer(&windowPID)))
		if windowPID != pid {
			return 1
		}
		if visible, _, _ := procIsWindowVisible.Call(hwnd); visible == 0 {
			return 1
		}
		if length, _, _ := procGetWindowTextLength.Call(hwnd); length == 0 {
			return 1
		}
		if owner, _, _ := procGetWindow.Call(hwnd, gwOwner); owner != 0 {
			return 1
		}
		found = hwnd
		return 0
	})
	procEnumWindows.Call(callback, 0)
	return found
}
