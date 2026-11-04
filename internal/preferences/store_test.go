package preferences

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"lingzhu-app/internal/appdb"
)

func openAt(t *testing.T, dir string) (*Store, *sql.DB) {
	t.Helper()
	db, _, err := appdb.OpenAt(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store, err := Open(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	return store, db
}

func TestGetMissingReturnsDefaults(t *testing.T) {
	store, _ := openAt(t, t.TempDir())
	got := store.Get()
	if got.Appearance.Density != "comfortable" || got.Appearance.TimelineWidth != "comfortable" {
		t.Fatalf("unexpected defaults: %+v", got.Appearance)
	}
	if got.Appearance.ReduceMotion != "system" || got.AutoApprove {
		t.Fatalf("unexpected defaults: %+v", got)
	}
}

func TestGetCorruptReturnsDefaults(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "preferences.json"), []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, _ := openAt(t, dir)
	got := store.Get()
	if got.Appearance.Density != "comfortable" {
		t.Fatalf("corrupt legacy file should fall back to defaults, got %+v", got)
	}
}

func TestSaveNormalizesAndRoundTrips(t *testing.T) {
	store, _ := openAt(t, t.TempDir())
	want := Preferences{
		DefaultWorkspace: "D:/code/project",
		AutoApprove:      true,
		Appearance: Appearance{
			FontFamily:    "  Inter  ",
			Density:       "dense",
			TimelineWidth: "wide",
			ReduceMotion:  "sometimes",
		},
	}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got := store.Get()
	if got.DefaultWorkspace != want.DefaultWorkspace || !got.AutoApprove {
		t.Fatalf("round trip lost scalar values: %+v", got)
	}
	if got.Appearance.FontFamily != "Inter" {
		t.Fatalf("font was not trimmed: %q", got.Appearance.FontFamily)
	}
	if got.Appearance.Density != "comfortable" {
		t.Fatalf("invalid density was not normalized: %q", got.Appearance.Density)
	}
	if got.Appearance.TimelineWidth != "wide" {
		t.Fatalf("valid timeline width was lost: %q", got.Appearance.TimelineWidth)
	}
	if got.Appearance.ReduceMotion != "system" {
		t.Fatalf("invalid motion value was not normalized: %q", got.Appearance.ReduceMotion)
	}
}

func TestDefaultModelIsNormalized(t *testing.T) {
	store, _ := openAt(t, t.TempDir())
	want := Preferences{DefaultModel: Selection{Provider: " p ", Model: " m "}}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got := store.Get()
	if got.DefaultModel.Provider != "p" || got.DefaultModel.Model != "m" {
		t.Fatalf("default model was not normalized: %+v", got.DefaultModel)
	}
}

func TestHalfFilledDefaultModelIsDropped(t *testing.T) {
	store, _ := openAt(t, t.TempDir())
	want := Preferences{DefaultModel: Selection{Provider: "p"}}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got := store.Get()
	if got.DefaultModel.Provider != "" || got.DefaultModel.Model != "" {
		t.Fatalf("half-filled selection should be dropped: %+v", got.DefaultModel)
	}
}

func TestMigratesLegacyPreferencesOnce(t *testing.T) {
	dir := t.TempDir()
	legacy := Preferences{
		DefaultWorkspace: "D:/legacy",
		AutoApprove:      true,
		Appearance:       Appearance{Density: "compact", TimelineWidth: "wide", ReduceMotion: "off"},
	}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "preferences.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}

	store, db := openAt(t, dir)
	got := store.Get()
	if got.DefaultWorkspace != "D:/legacy" || !got.AutoApprove || got.Appearance.Density != "compact" {
		t.Fatalf("legacy preferences were not imported: %+v", got)
	}

	// A later save must win over the legacy file after a restart.
	if err := store.Save(Preferences{DefaultWorkspace: "D:/new"}); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, _ := openAt(t, dir)
	if got := reopened.Get(); got.DefaultWorkspace != "D:/new" {
		t.Fatalf("legacy file overwrote a newer value: %+v", got)
	}
}
