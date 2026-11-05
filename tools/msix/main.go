// Command msix packages the desktop app and its core sidecar into one MSIX.
//
// wails3 tool msix only copies the executable it is given, so this wraps it:
// build a base package, unpack it with makeappx, add the core beside the app,
// and pack the result. Both binaries then live in the same directory inside the
// package, which is how the app locates the core at runtime.
//
// The package is not signed here: repacking after adding the core invalidates
// any signature, so signing belongs to the separate sign:msix task.
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	config := flag.String("config", "build/config.yml", "wails project config")
	app := flag.String("app", "bin/lingzhu-app.exe", "app executable")
	core := flag.String("core", "../lingzhu/bin/lingzhu.exe", "core executable")
	arch := flag.String("arch", "amd64", "target architecture")
	out := flag.String("out", "bin/lingzhu-app.msix", "output package")
	publisher := flag.String("publisher", "", "publisher, for example CN=Lingzhu")
	flag.Parse()

	if err := run(*config, *app, *core, *arch, *out, *publisher); err != nil {
		fmt.Fprintln(os.Stderr, "msix:", err)
		os.Exit(1)
	}
}

func run(config, app, core, arch, out, publisher string) error {
	if _, err := os.Stat(app); err != nil {
		return fmt.Errorf("app executable: %w", err)
	}
	if _, err := os.Stat(core); err != nil {
		return fmt.Errorf("core executable: %w", err)
	}
	work, err := os.MkdirTemp("", "lingzhu-msix-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)

	base := filepath.Join(work, "base.msix")
	unpacked := filepath.Join(work, "unpacked")
	args := []string{
		"tool", "msix",
		"--config", config,
		"--name", filepath.Base(app),
		"--executable", app,
		"--arch", arch,
		"--out", base,
	}
	if publisher != "" {
		args = append(args, "--publisher", publisher)
	}
	if err := execute("wails3", args...); err != nil {
		return fmt.Errorf("create base package: %w", err)
	}
	if err := execute("makeappx", "unpack", "/p", base, "/d", unpacked, "/o"); err != nil {
		return fmt.Errorf("unpack base package: %w", err)
	}
	// Place the core beside the app executable inside the package.
	if err := copyFile(core, filepath.Join(unpacked, filepath.Base(core))); err != nil {
		return err
	}
	if err := execute("makeappx", "pack", "/d", unpacked, "/p", out, "/o"); err != nil {
		return fmt.Errorf("pack package: %w", err)
	}
	fmt.Println("package", out)
	return nil
}

func execute(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s %s: %w", name, strings.Join(args, " "), err)
	}
	return nil
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}
