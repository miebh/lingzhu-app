package service

import "lingzhu-app/internal/core"

// GoalState returns the session goal, or nil when none is set.
func (s *CoreService) GoalState(workspace, sessionID string) (*core.Goal, error) {
	return callClient(s, workspace, func(client *core.Client) (*core.Goal, error) {
		return client.GoalState(s.ctx, sessionID)
	})
}

// GoalAction applies pause, resume or clear to the session goal.
func (s *CoreService) GoalAction(workspace, sessionID, action string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.GoalAction(s.ctx, sessionID, action)
	})
}
