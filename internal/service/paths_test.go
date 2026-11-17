package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverConfigPrefersExplicitPath(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LINGZHU_CONFIG", filepath.Join(dir, "explicit.json"))
	t.Chdir(dir)
	if got := discoverConfig(); got != filepath.Join(dir, "explicit.json") {
		t.Fatalf("explicit config should win: %q", got)
	}
}

func TestDiscoverConfigFindsProjectFileAndFallsBackToUserConfig(t *testing.T) {
	dir := t.TempDir()
	user := filepath.Join(dir, "user")
	t.Setenv("LINGZHU_CONFIG", "")
	t.Setenv("LINGZHU_CONFIG_DIR", user)

	project := filepath.Join(dir, "project")
	if err := os.MkdirAll(filepath.Join(project, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Chdir(filepath.Join(project, "sub"))

	if got, want := discoverConfig(), filepath.Join(user, "config.json"); got != want {
		t.Fatalf("without a project file the user config wins: got %q, want %q", got, want)
	}

	if err := os.WriteFile(filepath.Join(project, "lingzhu.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got, want := discoverConfig(), filepath.Join(project, "lingzhu.json"); got != want {
		t.Fatalf("a project file should be found upwards: got %q, want %q", got, want)
	}
}

func TestDiscoverConfigIgnoresBuildDirectory(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LINGZHU_CONFIG", "")
	t.Setenv("LINGZHU_CONFIG_DIR", filepath.Join(dir, "user"))
	if err := os.MkdirAll(filepath.Join(dir, "build"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "build", "config.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)
	if got, want := discoverConfig(), filepath.Join(dir, "user", "config.json"); got != want {
		t.Fatalf("build/config.json must not be discovered: got %q, want %q", got, want)
	}
}

func TestDiscoverWorkdirOnlyForProjectConfig(t *testing.T) {
	dir := t.TempDir()
	project := filepath.Join(dir, "project")
	if err := os.MkdirAll(project, 0o755); err != nil {
		t.Fatal(err)
	}
	if got, want := discoverWorkdir(filepath.Join(project, "lingzhu.json")), project; got != want {
		t.Fatalf("project config makes its directory the workdir: got %q, want %q", got, want)
	}

	t.Setenv("LINGZHU_CONFIG_DIR", filepath.Join(dir, "user"))
	if got := discoverWorkdir(filepath.Join(dir, "user", "config.json")); got != "" {
		t.Fatalf("the user config has no project workdir, got %q", got)
	}
}

func TestResolveBaseData(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LINGZHU_HOME", filepath.Join(dir, "home"))
	if got, want := resolveBaseData(""), filepath.Join(dir, "home", "data"); got != want {
		t.Fatalf("default data dir should follow the user data root: got %q, want %q", got, want)
	}

	project := filepath.Join(dir, "project")
	if err := os.MkdirAll(project, 0o755); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(project, "lingzhu.json")
	if err := os.WriteFile(config, []byte(`{"data_dir":"state"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if got, want := resolveBaseData(config), filepath.Join(project, "state"); got != want {
		t.Fatalf("explicit data_dir resolves next to the config: got %q, want %q", got, want)
	}
}

func TestDataDirUsesTheSharedStore(t *testing.T) {
	base := t.TempDir()
	project := filepath.Join(t.TempDir(), "project")
	if err := os.MkdirAll(project, 0o755); err != nil {
		t.Fatal(err)
	}

	service := &CoreService{baseData: base, defaultRoot: project}
	if got := service.dataDir(project); got != base {
		t.Fatalf("a workspace must use the shared store: got %q, want %q", got, base)
	}
}
