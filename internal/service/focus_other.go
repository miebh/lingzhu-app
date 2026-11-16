//go:build !windows

package service

// raiseMainWindow reports that this platform has no native raise path, so the
// caller uses the framework's window API instead.
func raiseMainWindow() bool {
	return false
}
