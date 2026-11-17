package service

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

// WorktreeSessions counts durable sessions recorded for each directory. The
// core keeps every project in one store, so a worktree's sessions are counted
// from the session's placement.
func (s *CoreService) WorktreeSessions(paths []string) map[string]int {
	out := make(map[string]int, len(paths))
	shared := filepath.Join(s.baseData, "sessions", "sessions.db")
	sharedCounts := countByDirectory(shared)

	for _, path := range paths {
		out[path] = sharedCounts[strings.ToLower(filepath.Clean(path))]
	}
	return out
}

// countByDirectory returns how many sessions each recorded directory owns.
func countByDirectory(dbPath string) map[string]int {
	out := map[string]int{}
	db, err := openReadOnly(dbPath)
	if err != nil {
		return out
	}
	defer db.Close()
	rows, err := db.Query(
		`SELECT LOWER(directory), COUNT(*) FROM sessions s
		  WHERE EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id)
		  GROUP BY LOWER(directory)`,
	)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var (
			directory string
			count     int
		)
		if err := rows.Scan(&directory, &count); err != nil {
			return out
		}
		out[strings.ToLower(filepath.Clean(directory))] = count
	}
	return out
}

// openReadOnly opens a session database without creating it.
func openReadOnly(dbPath string) (*sql.DB, error) {
	if _, err := os.Stat(dbPath); err != nil {
		return nil, err
	}
	return sql.Open("sqlite", "file:"+filepath.ToSlash(dbPath)+"?mode=ro")
}
