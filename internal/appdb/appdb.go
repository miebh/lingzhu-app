// Package appdb owns the desktop app's local SQLite database. Configuration
// files stay on disk; every other piece of local state lives here.
package appdb

import (
	"database/sql"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Open opens the database under the user config directory and returns its path.
func Open() (*sql.DB, string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	return OpenAt(filepath.Join(base, "lingzhu", "app"))
}

// OpenAt opens (and creates) the database in dir. Tests use it directly.
func OpenAt(dir string) (*sql.DB, string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, "", err
	}
	path := filepath.Join(dir, "app.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, "", err
	}
	// One connection serializes writers and keeps per-connection pragmas
	// predictable. App state is small, so WAL parallelism is not needed.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := setup(db); err != nil {
		_ = db.Close()
		return nil, "", err
	}
	return db, path, nil
}

func setup(db *sql.DB) error {
	var mode string
	if err := db.QueryRow("PRAGMA journal_mode=WAL").Scan(&mode); err != nil {
		return err
	}
	for _, pragma := range []string{
		"PRAGMA busy_timeout=5000",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA foreign_keys=ON",
	} {
		if _, err := db.Exec(pragma); err != nil {
			return err
		}
	}
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS meta (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`)
	return err
}
