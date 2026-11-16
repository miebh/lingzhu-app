// Command nsis packs the app and its core sidecar into an NSIS installer.
//
// makensis is not added to PATH by the NSIS installer, so `wails3 task package`
// used to fail on a machine where NSIS was installed but not on PATH. This tool
// locates makensis in the standard install locations and runs it with the same
// defines the task used to pass.
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func main() {
	app := flag.String("app", "bin/lingzhu-app.exe", "app executable")
	core := flag.String("core", "bin/lingzhu.exe", "core sidecar executable")
	arch := flag.String("arch", "amd64", "target architecture")
	scope := flag.String("scope", "user", "install scope: user or machine")
	script := flag.String("script", "project.nsi", "NSIS script to compile")
	license := flag.String("license", "", "license file to install beside the binaries")
	notices := flag.String("notices", "", "third-party notices file to install beside the binaries")
	flag.Parse()

	if err := run(*app, *core, *arch, *scope, *script, *license, *notices); err != nil {
		fmt.Fprintln(os.Stderr, "nsis:", err)
		os.Exit(1)
	}
}

func run(app, core, arch, scope, script, license, notices string) error {
	for _, path := range []string{app, core} {
		if _, err := os.Stat(path); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
	}
	if scope != "user" && scope != "machine" {
		return fmt.Errorf("scope must be user or machine, got %q", scope)
	}
	makensis, err := findMakensis()
	if err != nil {
		return err
	}
	appPath, err := filepath.Abs(app)
	if err != nil {
		return err
	}
	corePath, err := filepath.Abs(core)
	if err != nil {
		return err
	}
	argFlag := "AMD64"
	if arch == "arm64" {
		argFlag = "ARM64"
	}
	args := []string{
		"-DARG_WAILS_" + argFlag + "_BINARY=" + appPath,
		"-DARG_WAILS_CORE_BINARY=" + corePath,
	}
	if license != "" {
		licensePath, err := filepath.Abs(license)
		if err != nil {
			return err
		}
		args = append(args, "-DARG_WAILS_LICENSE="+licensePath)
	}
	if notices != "" {
		noticesPath, err := filepath.Abs(notices)
		if err != nil {
			return err
		}
		args = append(args, "-DARG_WAILS_NOTICES="+noticesPath)
	}
	if scope == "user" {
		// A per-user install needs no elevation and stays writable for the
		// app's own settings page.
		args = append(args, "-DWAILS_INSTALL_SCOPE=user", "-DREQUEST_EXECUTION_LEVEL=user")
	}
	args = append(args, script)

	cmd := exec.Command(makensis, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s: %w", makensis, err)
	}
	return nil
}

// findMakensis returns the first makensis that exists: PATH, then the standard
// NSIS install directories on Windows.
func findMakensis() (string, error) {
	if path, err := exec.LookPath("makensis"); err == nil {
		return path, nil
	}
	name := "makensis"
	if runtime.GOOS == "windows" {
		name = "makensis.exe"
	}
	candidates := []string{}
	if runtime.GOOS == "windows" {
		for _, root := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles")} {
			if root == "" {
				continue
			}
			candidates = append(candidates, filepath.Join(root, "NSIS", name))
		}
	}
	candidates = append(candidates, filepath.Join("/usr", "bin", name), filepath.Join("/usr", "local", "bin", name))
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("makensis not found; install NSIS or add it to PATH (looked in %s)", strings.Join(candidates, ", "))
}
