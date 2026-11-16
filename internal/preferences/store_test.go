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
	if got.Appearance.SidebarOrganize != "list" ||
		got.Appearance.TabLayout != "vertical" ||
		got.Appearance.Language != "en" ||
		got.Appearance.Theme != "system" {
		t.Fatalf("unexpected appearance defaults: %+v", got.Appearance)
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

func TestTimelineDetailDefaultsToCompact(t *testing.T) {
	got := Default().Appearance.TimelineDetail
	if got.Shell.Placement != placementGrouped ||
		got.Edit.Placement != placementGrouped ||
		got.Thinking.Placement != placementGrouped ||
		got.Tools.Placement != placementGrouped ||
		got.Subagents.Placement != placementSeparate {
		t.Fatalf("default timeline detail should be compact: %+v", got)
	}
}

func TestTimelineDetailLegacyStringLoads(t *testing.T) {
	var prefs Preferences
	if err := json.Unmarshal([]byte(`{"appearance":{"timelineDetail":"compact"}}`), &prefs); err != nil {
		t.Fatal(err)
	}
	prefs = Normalize(prefs)
	if prefs.Appearance.TimelineDetail.Shell.Placement != placementGrouped ||
		prefs.Appearance.TimelineDetail.Thinking.Placement != placementGrouped ||
		prefs.Appearance.TimelineDetail.Subagents.Placement != placementSeparate {
		t.Fatalf("legacy compact detail was not mapped: %+v", prefs.Appearance.TimelineDetail)
	}

	var summary Preferences
	if err := json.Unmarshal([]byte(`{"appearance":{"timelineDetail":"summary"}}`), &summary); err != nil {
		t.Fatal(err)
	}
	summary = Normalize(summary)
	if summary.Appearance.TimelineDetail.Shell.Placement != placementGrouped ||
		summary.Appearance.TimelineDetail.Tools.Placement != placementGrouped {
		t.Fatalf("legacy summary detail was not mapped to compact: %+v", summary.Appearance.TimelineDetail)
	}
}

func TestTimelineDetailObjectRoundTrips(t *testing.T) {
	store, _ := openAt(t, t.TempDir())
	want := defaultTimelineDetail()
	want.Shell = TimelineCategoryDetail{Placement: placementHidden, Details: expansionExpanded}
	want.Tools = TimelinePlacementDetail{Placement: placementSeparate}
	if err := store.Save(Preferences{Appearance: Appearance{TimelineDetail: want}}); err != nil {
		t.Fatal(err)
	}
	got := store.Get().Appearance.TimelineDetail
	if got.Shell.Placement != placementHidden || got.Shell.Details != expansionExpanded ||
		got.Tools.Placement != placementSeparate {
		t.Fatalf("timeline detail did not round trip: %+v", got)
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

func TestCompletionNoticesDefaultOn(t *testing.T) {
	notices := Default().Notifications
	if !notices.Agent || !notices.Errors {
		t.Fatalf("a finished or failed run must report by default: %+v", notices)
	}
	if !notices.Permissions || !notices.Questions {
		t.Fatalf("approvals and questions must stay on by default: %+v", notices)
	}
}

// An install that predates completion notices kept the old default, so a run's
// end was silent. The upgrade turns those two channels on once, and must not
// touch a channel the user changed.
func TestCompletionNoticesUpgradeOldDefault(t *testing.T) {
	dir := t.TempDir()
	_, db := openAt(t, dir)
	legacy := Default()
	legacy.Notifications = Notifications{Agent: false, Permissions: true, Questions: true, Errors: false}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT OR REPLACE INTO preferences(id, data) VALUES(1, ?)`, string(data)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM meta WHERE key = ?`, notificationsKey); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, _ := openAt(t, dir)
	got := reopened.Get().Notifications
	if !got.Agent || !got.Errors {
		t.Fatalf("completion channels were not enabled: %+v", got)
	}
	if !got.Permissions || !got.Questions {
		t.Fatalf("upgrade changed an untouched channel: %+v", got)
	}
}

func TestCompletionNoticesUpgradeKeepsUserChoice(t *testing.T) {
	dir := t.TempDir()
	_, db := openAt(t, dir)
	custom := Default()
	// The user turned the completion notice off on purpose.
	custom.Notifications = Notifications{Agent: false, Permissions: false, Questions: true, Errors: true}
	data, err := json.Marshal(custom)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT OR REPLACE INTO preferences(id, data) VALUES(1, ?)`, string(data)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM meta WHERE key = ?`, notificationsKey); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, _ := openAt(t, dir)
	got := reopened.Get().Notifications
	if got.Agent || got.Permissions {
		t.Fatalf("upgrade overrode a deliberate choice: %+v", got)
	}
}

func TestShowMessageAgentDefaultsOff(t *testing.T) {
	if Default().ShowMessageAgent {
		t.Fatal("message agent labels must stay hidden by default")
	}
	var prefs Preferences
	if err := json.Unmarshal([]byte(`{"showAgent":true}`), &prefs); err != nil {
		t.Fatal(err)
	}
	if prefs.ShowMessageAgent {
		t.Fatal("legacy preferences must not enable message agent labels")
	}
}
