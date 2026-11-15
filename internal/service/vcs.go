package service

import (
	"lingzhu-app/internal/core"
)

// VCSInfo returns repository metadata for one workspace.
func (s *CoreService) VCSInfo(workspace string) (core.VCSInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.VCSInfo, error) {
		return client.VCSInfo(s.ctx)
	})
}

// VCSBase returns the inferred review base, or nil before the first commit.
func (s *CoreService) VCSBase(workspace string) (*core.VCSBase, error) {
	return callClient(s, workspace, func(client *core.Client) (*core.VCSBase, error) {
		return client.VCSBase(s.ctx)
	})
}

// VCSStatus lists uncommitted files for one workspace.
func (s *CoreService) VCSStatus(workspace string) ([]core.VCSFileStatus, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.VCSFileStatus, error) {
		return client.VCSStatus(s.ctx)
	})
}

// VCSBranches lists local and remote branches for one workspace.
func (s *CoreService) VCSBranches(workspace, search string, limit int) ([]string, error) {
	return callClient(s, workspace, func(client *core.Client) ([]string, error) {
		return client.VCSBranches(s.ctx, search, limit)
	})
}

// VCSDiff returns per-file patches for one comparison mode.
func (s *CoreService) VCSDiff(workspace, mode, base string, contextLines int, untracked string) ([]core.VCSFileDiff, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.VCSFileDiff, error) {
		return client.VCSDiff(s.ctx, mode, base, contextLines, untracked)
	})
}

// SessionDiff returns changes since the session's first captured turn.
func (s *CoreService) SessionDiff(workspace, sessionID string) (core.SessionDiff, error) {
	return callClient(s, workspace, func(client *core.Client) (core.SessionDiff, error) {
		return client.SessionDiff(s.ctx, sessionID)
	})
}

// VCSInit initializes a git repository for one workspace.
func (s *CoreService) VCSInit(workspace string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.VCSInit(s.ctx)
	})
}
