package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// WorktreeSession is one durable session recorded inside a worktree.
type WorktreeSession struct {
	ID      string    `json:"id"`
	Title   string    `json:"title"`
	Updated time.Time `json:"updated"`
}

// WorktreeInspection is the state the delete confirmation needs before it can
// remove a checkout: whether it is active, whether git reports changes, and
// its linked sessions.
type WorktreeInspection struct {
	Active   bool              `json:"active"`
	Dirty    bool              `json:"dirty"`
	Known    bool              `json:"known"`
	Error    string            `json:"error,omitempty"`
	Sessions []WorktreeSession `json:"sessions"`
}

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

// WorktreeSessionDetails returns the durable sessions recorded in each
// directory, newest first, so the settings list can name them. A read failure
// is returned instead of an empty list, because an unreadable store must not
// look like "no sessions".
func (s *CoreService) WorktreeSessionDetails(paths []string) (map[string][]WorktreeSession, error) {
	out := make(map[string][]WorktreeSession, len(paths))
	wanted := make(map[string]string, len(paths))
	for _, path := range paths {
		wanted[strings.ToLower(filepath.Clean(path))] = path
		out[path] = []WorktreeSession{}
	}
	if len(wanted) == 0 {
		return out, nil
	}

	shared := filepath.Join(s.baseData, "sessions", "sessions.db")
	db, err := openReadOnly(shared)
	if err != nil {
		if os.IsNotExist(err) {
			return out, nil
		}
		return out, err
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT s.id, s.title, s.directory, s.updated FROM sessions s
		  WHERE EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id)
		  ORDER BY s.updated DESC`,
	)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			id        string
			title     string
			directory string
			updated   int64
		)
		if err := rows.Scan(&id, &title, &directory, &updated); err != nil {
			return out, err
		}
		path, ok := wanted[strings.ToLower(filepath.Clean(directory))]
		if !ok {
			continue
		}
		out[path] = append(out[path], WorktreeSession{
			ID:      id,
			Title:   title,
			Updated: time.UnixMilli(updated).UTC(),
		})
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	return out, nil
}

// WorktreeInspect checks one checkout before deletion. A failed git status is
// reported instead of guessed, so the UI can offer Retry rather than deleting
// a checkout it could not verify.
func (s *CoreService) WorktreeInspect(path, active string) WorktreeInspection {
	path = filepath.Clean(path)
	result := WorktreeInspection{
		Active: active != "" && pathContains(path, active),
	}
	details, err := s.WorktreeSessionDetails([]string{path})
	if err != nil {
		result.Error = err.Error()
		return result
	}
	result.Sessions = details[path]
	dirty, err := worktreeDirty(path)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	result.Known = true
	result.Dirty = dirty
	return result
}

func worktreeDirty(path string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "-C", path, "status", "--porcelain", "--untracked-files=normal")
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(out))
		if detail == "" {
			detail = err.Error()
		}
		return false, fmt.Errorf("git status: %s", detail)
	}
	return strings.TrimSpace(string(out)) != "", nil
}

func pathContains(root, child string) bool {
	root = filepath.Clean(root)
	child = filepath.Clean(child)
	if runtime.GOOS == "windows" {
		root = strings.ToLower(root)
		child = strings.ToLower(child)
	}
	rel, err := filepath.Rel(root, child)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)))
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
