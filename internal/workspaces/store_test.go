package workspaces

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

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

func TestAddListRemove(t *testing.T) {
	store, _ := openAt(t, t.TempDir())

	if list, err := store.List(); err != nil || len(list) != 0 {
		t.Fatalf("new store should be empty: %+v, %v", list, err)
	}
	for _, path := range []string{"/a", "/b", "/a"} {
		if _, err := store.Add(path); err != nil {
			t.Fatal(err)
		}
	}
	list, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Path != "/a" || list[1].Path != "/b" {
		t.Fatalf("unexpected order after add: %+v", list)
	}
	if list[0].Added.IsZero() {
		t.Fatalf("added time was not stored: %+v", list[0])
	}

	list, err = store.Remove("/a")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Path != "/b" {
		t.Fatalf("unexpected list after remove: %+v", list)
	}
}

func TestMigratesLegacyList(t *testing.T) {
	dir := t.TempDir()
	added := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	legacy := []Workspace{
		{Path: "/b", Added: added},
		{Path: "/a", Added: added.Add(time.Minute)},
	}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "workspaces.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}

	store, _ := openAt(t, dir)
	list, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Path != "/b" || list[1].Path != "/a" {
		t.Fatalf("legacy order was not preserved: %+v", list)
	}
	if !list[0].Added.Equal(added) {
		t.Fatalf("legacy added time was not preserved: %+v", list[0].Added)
	}
}

func TestLegacyDoesNotOverwriteNewerList(t *testing.T) {
	dir := t.TempDir()
	legacy := []Workspace{{Path: "/legacy"}}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "workspaces.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}

	store, db := openAt(t, dir)
	if _, err := store.Remove("/legacy"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Add("/new"); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, _ := openAt(t, dir)
	list, err := reopened.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Path != "/new" {
		t.Fatalf("legacy file should not be imported twice: %+v", list)
	}
}

func TestCorruptLegacyListIsReported(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "workspaces.json"), []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	db, _, err := appdb.OpenAt(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := Open(db, dir); err == nil {
		t.Fatal("want an error for a corrupt workspace list")
	}
}
