package preferences

import (
	"encoding/json"
	"testing"
)

func TestPinnedSessionsAreNormalized(t *testing.T) {
	prefs := Normalize(Preferences{
		Pinned: []string{" s1 ", "s1", "", "s2", "   ", "s3"},
	})
	if len(prefs.Pinned) != 3 || prefs.Pinned[0] != "s1" || prefs.Pinned[1] != "s2" || prefs.Pinned[2] != "s3" {
		t.Fatalf("unexpected pinned sessions: %+v", prefs.Pinned)
	}

	empty := Normalize(Preferences{Pinned: []string{"  "}})
	if empty.Pinned == nil || len(empty.Pinned) != 0 {
		t.Fatalf("empty pinned list should be an empty slice, got %+v", empty.Pinned)
	}
	data, err := json.Marshal(empty.Pinned)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "[]" {
		t.Fatalf("empty pinned list must serialize as [], got %s", data)
	}
}
