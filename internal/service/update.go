package service

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"lingzhu-app/internal/detach"
)

// updateLogName records what the detached installer did, because its output
// cannot reach this process once it is gone.
const updateLogName = "update.log"

// InstallUpdate starts a downloaded installer detached from this process, then
// quits the app so the installer can replace both binaries.
//
// The installer is launched through detach.Launch, which leaves the caller's
// job object: a process that exits mid-update would otherwise kill the
// installer halfway and leave a half-written install behind.
func (s *CoreService) InstallUpdate(path string) error {
	target := strings.TrimSpace(path)
	if target == "" {
		return errors.New("install update: no installer given")
	}
	abs, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return fmt.Errorf("install update: %w", err)
	}
	if info.IsDir() {
		return fmt.Errorf("install update: %s is a directory", abs)
	}
	if !strings.EqualFold(filepath.Ext(abs), ".exe") {
		return fmt.Errorf("install update: %s is not a Windows installer", abs)
	}

	logPath, logFile := openUpdateLog()
	cmd := exec.Command(abs, "/S")
	if dir := filepath.Dir(abs); dir != "" {
		cmd.Dir = dir
	}
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		defer func() { _ = logFile.Close() }()
	}
	if err := detach.Launch(cmd); err != nil {
		if logPath != "" {
			return fmt.Errorf("install update: %w (log: %s)", err, logPath)
		}
		return fmt.Errorf("install update: %w", err)
	}
	// The installer waits for this process to disappear before replacing the
	// binary, so quitting is part of the update rather than a side effect.
	go func() {
		time.Sleep(500 * time.Millisecond)
		if app := application.Get(); app != nil {
			app.Quit()
		}
	}()
	return nil
}

// openUpdateLog appends the installer's output under the log directory. A
// failure to open it must not block the update, so it reports nil on error.
func openUpdateLog() (string, *os.File) {
	dir := localCacheDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", nil
	}
	path := filepath.Join(dir, updateLogName)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return "", nil
	}
	_, _ = file.WriteString("\ninstaller started " + time.Now().Format(time.RFC3339) + "\n")
	return path, file
}
