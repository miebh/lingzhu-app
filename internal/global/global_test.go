package global

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOverrideRedirectsDataAndCache(t *testing.T) {
	root := t.TempDir()
	t.Setenv("LINGZHU_HOME", root)
	if got, want := Data(), filepath.Join(root, "data"); got != want {
		t.Fatalf("data = %q, want %q", got, want)
	}
	if got, want := Cache(), filepath.Join(root, "cache"); got != want {
		t.Fatalf("cache = %q, want %q", got, want)
	}
	if got, want := Log(), filepath.Join(root, "cache", "log"); got != want {
		t.Fatalf("log = %q, want %q", got, want)
	}
}

func TestAppDataSitsUnderConfig(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LINGZHU_CONFIG_DIR", dir)
	t.Setenv("LINGZHU_HOME", "")
	if got, want := AppData(), filepath.Join(dir, "app"); got != want {
		t.Fatalf("app data = %q, want %q", got, want)
	}
}

func TestAppDataFollowsDevOverride(t *testing.T) {
	root := t.TempDir()
	t.Setenv("LINGZHU_HOME", root)
	if got, want := AppData(), filepath.Join(root, "state"); got != want {
		t.Fatalf("app data = %q, want %q", got, want)
	}
}

func TestConfigRootsAtAppName(t *testing.T) {
	t.Setenv("LINGZHU_CONFIG_DIR", "")
	base, err := os.UserConfigDir()
	if err != nil {
		t.Skip("no user config directory on this machine")
	}
	if got, want := Config(), filepath.Join(base, "lingzhu"); got != want {
		t.Fatalf("config = %q, want %q", got, want)
	}
}
