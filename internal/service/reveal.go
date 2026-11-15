package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// RevealPath opens the platform file manager at path. The desktop app uses it
// from the session location card, like the reference's reveal action.
func (s *CoreService) RevealPath(path string) error {
	if path == "" {
		return fmt.Errorf("reveal: empty path")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if _, err := os.Stat(abs); err != nil {
		return err
	}
	var command string
	var args []string
	switch runtime.GOOS {
	case "windows":
		command, args = "explorer", []string{abs}
	case "darwin":
		command, args = "open", []string{abs}
	default:
		command, args = "xdg-open", []string{abs}
	}
	return exec.Command(command, args...).Start()
}
