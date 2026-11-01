package preferences

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetMissingReturnsDefaults(t *testing.T) {
	store := &Store{path: filepath.Join(t.TempDir(), "preferences.json")}
	got := store.Get()
	if got.Appearance.Density != "comfortable" || got.Appearance.TimelineWidth != "comfortable" {
		t.Fatalf("unexpected defaults: %+v", got.Appearance)
	}
	if got.Appearance.ReduceMotion != "system" || got.AutoApprove {
		t.Fatalf("unexpected defaults: %+v", got)
	}
}

func TestGetCorruptReturnsDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "preferences.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	got := (&Store{path: path}).Get()
	if got.Appearance.Density != "comfortable" {
		t.Fatalf("corrupt file should fall back to defaults, got %+v", got)
	}
}

func TestSaveNormalizesAndRoundTrips(t *testing.T) {
	store := &Store{path: filepath.Join(t.TempDir(), "preferences.json")}
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

func TestWorkspaceModelsAreNormalized(t *testing.T) {
	store := &Store{path: filepath.Join(t.TempDir(), "preferences.json")}
	want := Preferences{
		WorkspaceModels: map[string]Selection{
			" D:/project ": {Provider: " p ", Model: " m "},
			"":             {Provider: "p", Model: "m"},
			"D:/other":     {Provider: "", Model: "m"},
		},
	}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got := store.Get()
	if len(got.WorkspaceModels) != 1 {
		t.Fatalf("invalid entries were not dropped: %+v", got.WorkspaceModels)
	}
	selection, ok := got.WorkspaceModels["D:/project"]
	if !ok || selection.Provider != "p" || selection.Model != "m" {
		t.Fatalf("workspace selection was not normalized: %+v", got.WorkspaceModels)
	}
}
