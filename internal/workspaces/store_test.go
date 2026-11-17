package workspaces

import (
	"database/sql"
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
