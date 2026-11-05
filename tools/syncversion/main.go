// Command syncversion stamps the release version into every packaging file:
// the Wails project config, the Windows version resource, and the macOS
// plists. The app and core binaries get their version from -ldflags, so this
// only keeps the packaging metadata in step with the same number.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
)

func main() {
	version := flag.String("version", "", "release version, for example 0.1.0")
	flag.Parse()
	if err := run(*version); err != nil {
		fmt.Fprintln(os.Stderr, "syncversion:", err)
		os.Exit(1)
	}
}

func run(version string) error {
	if !regexp.MustCompile(`^\d+\.\d+\.\d+`).MatchString(version) {
		return fmt.Errorf("version %q is not semantic", version)
	}
	if err := syncConfig("build/config.yml", version); err != nil {
		return err
	}
	if err := syncInfoJSON("build/windows/info.json", version); err != nil {
		return err
	}
	for _, path := range []string{"build/darwin/Info.plist"} {
		if err := syncPlist(path, version); err != nil {
			return err
		}
	}
	if err := syncNFPM("build/linux/nfpm/nfpm.yaml", version); err != nil {
		return err
	}
	fmt.Println("version", version)
	return nil
}

var configVersionLine = regexp.MustCompile(`(?m)^(\s*version:\s*")[^"]*(")`)

func syncConfig(path, version string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	// The file starts with `version: '3'`, the Wails config schema version, so
	// only the quoted form inside `info:` is the product version.
	updated := configVersionLine.ReplaceAllString(string(data), "${1}"+version+"${2}")
	return writeIfChanged(path, updated)
}

var (
	infoFileVersion    = regexp.MustCompile(`("file_version"\s*:\s*")[^"]*(")`)
	infoProductVersion = regexp.MustCompile(`("product_version"\s*:\s*")[^"]*(")`)
	infoStringVersion  = regexp.MustCompile(`("ProductVersion"\s*:\s*")[^"]*(")`)
)

// syncInfoJSON rewrites the version fields in place, so the Windows version
// resource keeps its formatting and field order. Both the fixed structure and
// the string table carry the number.
func syncInfoJSON(path, version string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	updated := infoFileVersion.ReplaceAllString(string(data), "${1}"+version+"${2}")
	updated = infoProductVersion.ReplaceAllString(updated, "${1}"+version+"${2}")
	updated = infoStringVersion.ReplaceAllString(updated, "${1}"+version+"${2}")
	var check map[string]any
	if err := json.Unmarshal([]byte(updated), &check); err != nil {
		return err
	}
	return writeIfChanged(path, updated)
}

var plistVersion = regexp.MustCompile(`(?m)(<key>CFBundle(?:Version|ShortVersionString)</key>\s*<string>)[^<]*(</string>)`)

func syncPlist(path, version string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	updated := plistVersion.ReplaceAllString(string(data), "${1}"+version+"${2}")
	return writeIfChanged(path, updated)
}

var nfpmVersion = regexp.MustCompile(`(?m)^(version:\s*")[^"]*(")`)

func syncNFPM(path, version string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	updated := nfpmVersion.ReplaceAllString(string(data), "${1}"+version+"${2}")
	return writeIfChanged(path, updated)
}

func writeIfChanged(path, content string) error {
	current, err := os.ReadFile(path)
	if err == nil && string(current) == content {
		return nil
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

// trimmed is unused by the tool but documents that a version file may carry a
// trailing newline; the Taskfile trims it before passing it in.
func trimmed(value string) string { return strings.TrimSpace(value) }
