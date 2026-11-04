package appdb

import (
	"os"
	"testing"
)

func TestOpenAtCreatesWALDatabase(t *testing.T) {
	dir := t.TempDir()
	db, path, err := OpenAt(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("database file was not created: %v", err)
	}
	var mode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Fatalf("want WAL journal mode, got %q", mode)
	}
	if _, err := db.Exec(`INSERT INTO meta(key, value) VALUES('k', 'v')`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, _, err := OpenAt(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	var value string
	if err := reopened.QueryRow(`SELECT value FROM meta WHERE key = 'k'`).Scan(&value); err != nil {
		t.Fatal(err)
	}
	if value != "v" {
		t.Fatalf("row did not survive reopen: %q", value)
	}
}
