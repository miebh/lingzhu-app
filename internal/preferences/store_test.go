package preferences

import (
	"database/sql"
	"encoding/json"
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
	store, err := Open(db)
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
	if got.AutoApprove {
		t.Fatalf("unexpected defaults: %+v", got)
	}
	if got.Appearance.SidebarOrganize != "list" ||
		got.Appearance.Language != "en" ||
		got.Appearance.Theme != "system" {
		t.Fatalf("unexpected appearance defaults: %+v", got.Appearance)
	}
}

func TestGetCorruptReturnsDefaults(t *testing.T) {
	dir := t.TempDir()
	store, db := openAt(t, dir)
	if _, err := db.Exec(`INSERT OR REPLACE INTO preferences(id, data) VALUES(1, ?)`, "{not json"); err != nil {
		t.Fatal(err)
	}
	got := store.Get()
	if got.Appearance.Density != "comfortable" {
		t.Fatalf("corrupt stored preferences should fall back to defaults, got %+v", got)
	}
}

func TestSaveNormalizesAndRoundTrips(t *testing.T) {
	store, _ := openAt(t, t.TempDir())
	want := Preferences{
		DefaultWorkspace: "D:/code/project",
		AutoApprove:      true,
		Appearance: Appearance{
			Density:       "dense",
			TimelineWidth: "wide",
		},
	}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got := store.Get()
	if got.DefaultWorkspace != want.DefaultWorkspace || !got.AutoApprove {
		t.Fatalf("round trip lost scalar values: %+v", got)
	}
	if got.Appearance.Density != "comfortable" {
		t.Fatalf("invalid density was not normalized: %q", got.Appearance.Density)
	}
	if got.Appearance.TimelineWidth != "wide" {
		t.Fatalf("valid timeline width was lost: %q", got.Appearance.TimelineWidth)
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

func TestCompletionNoticesDefaultOn(t *testing.T) {
	notices := Default().Notifications
	if !notices.Agent || !notices.Errors {
		t.Fatalf("a finished or failed run must report by default: %+v", notices)
	}
	if !notices.Permissions || !notices.Questions {
		t.Fatalf("approvals and questions must stay on by default: %+v", notices)
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
		t.Fatal("missing fields must not enable message agent labels")
	}
}
