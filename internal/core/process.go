package core

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"lingzhu-app/internal/global"
)

// DefaultAddr is where the core listens unless configuration says otherwise.
const DefaultAddr = "127.0.0.1:8787"

// Options configure how a core is located or started.
type Options struct {
	Addr    string
	Binary  string
	Workdir string
	DataDir string
	Config  string
}

// Core is either a core this process started or one it connected to.
type Core struct {
	Client  *Client
	Addr    string
	Owned   bool
	LogPath string

	cmd    *exec.Cmd
	exited chan error
}

// Ensure connects to a running core, starting one when none answers. It never
// starts a second instance on the same address.
func Ensure(ctx context.Context, opts Options) (*Core, error) {
	addr := opts.Addr
	if addr == "" {
		addr = os.Getenv("LINGZHU_ADDR")
	}
	if addr == "" {
		addr = DefaultAddr
	}
	client := New("http://" + addr)
	if probe(ctx, client) == nil {
		return &Core{Client: client, Addr: addr}, nil
	}

	binary, err := findBinary(opts.Binary)
	if err != nil {
		return nil, err
	}
	logPath, logFile, err := openLog()
	if err != nil {
		return nil, err
	}

	args := []string{"serve", "-addr", addr}
	if opts.Workdir != "" {
		args = append(args, "-workdir", opts.Workdir)
	}
	if opts.DataDir != "" {
		args = append(args, "-data", opts.DataDir)
	}
	if opts.Config != "" {
		args = append(args, "-config", opts.Config)
	}
	cmd := exec.Command(binary, args...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = opts.Workdir
	cmd.Env = append(os.Environ(), "LINGZHU_PARENT_PID="+strconv.Itoa(os.Getpid()))
	hideChildWindow(cmd)
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start core: %w", err)
	}

	core := &Core{Client: client, Addr: addr, Owned: true, LogPath: logPath, cmd: cmd, exited: make(chan error, 1)}
	go func() { core.exited <- cmd.Wait() }()

	if err := waitHealthy(ctx, core); err != nil {
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("%w (log: %s)", err, logPath)
	}
	return core, nil
}

// Stop shuts down a core this process started. A reused core is left alone.
func (c *Core) Stop(ctx context.Context) error {
	if !c.Owned || c.cmd == nil {
		return nil
	}
	shutdownCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	err := c.Client.Shutdown(shutdownCtx)
	cancel()
	if err == nil {
		select {
		case <-c.exited:
			return nil
		case <-time.After(7 * time.Second):
		}
	}
	if c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
	select {
	case <-c.exited:
	case <-time.After(2 * time.Second):
	}
	return nil
}

func waitHealthy(ctx context.Context, core *Core) error {
	deadline := time.Now().Add(15 * time.Second)
	for {
		if probe(ctx, core.Client) == nil {
			return nil
		}
		select {
		case err := <-core.exited:
			return fmt.Errorf("core exited during startup: %v", err)
		case <-time.After(120 * time.Millisecond):
		}
		if time.Now().After(deadline) {
			return errors.New("core did not become healthy within 15s")
		}
	}
}

func probe(ctx context.Context, client *Client) error {
	probeCtx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	return client.Health(probeCtx)
}

// findBinary looks next to the app, on PATH, and finally at an explicit
// override. A development run sets LINGZHU_CORE; a release install puts the
// core beside the app, so no directory outside the install is searched.
func findBinary(explicit string) (string, error) {
	name := "lingzhu"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	var candidates []string
	add := func(path string) {
		if path != "" {
			candidates = append(candidates, path)
		}
	}
	add(explicit)
	add(os.Getenv("LINGZHU_CORE"))
	if exe, err := os.Executable(); err == nil {
		add(filepath.Join(filepath.Dir(exe), name))
	}
	for _, candidate := range candidates {
		abs, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		if info, err := os.Stat(abs); err == nil && !info.IsDir() {
			return abs, nil
		}
	}
	if path, err := exec.LookPath("lingzhu"); err == nil {
		return path, nil
	}
	return "", errors.New("lingzhu core not found; install it beside the app or set LINGZHU_CORE")
}

// logRotationLimit keeps the log from growing without bound; the previous file
// is kept as core.log.1.
const logRotationLimit = 5 << 20

func openLog() (string, *os.File, error) {
	dir := global.Log()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", nil, err
	}
	path := filepath.Join(dir, "core.log")
	if info, err := os.Stat(path); err == nil && info.Size() >= logRotationLimit {
		_ = os.Remove(path + ".1")
		_ = os.Rename(path, path+".1")
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return "", nil, err
	}
	_, _ = file.WriteString(strings.Repeat("-", 60) + "\nstarted " + time.Now().Format(time.RFC3339) + "\n")
	return path, file, nil
}
