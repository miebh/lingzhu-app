package core

import (
	"context"
	"net/http"
)

// GoalStatus is the lifecycle state of a session goal.
type GoalStatus string

const (
	GoalActive   GoalStatus = "active"
	GoalPaused   GoalStatus = "paused"
	GoalComplete GoalStatus = "complete"
)

// Goal is the per-session objective the agent works toward across turns.
type Goal struct {
	ID        string     `json:"id"`
	Objective string     `json:"objective"`
	Status    GoalStatus `json:"status"`
	Reason    string     `json:"reason,omitempty"`
	Rounds    int        `json:"rounds"`
	MaxRounds int        `json:"maxRounds"`
	Stalls    int        `json:"stalls,omitempty"`
	UpdatedAt string     `json:"updatedAt"`
}

// GoalState returns the session goal, or nil when none is set.
func (c *Client) GoalState(ctx context.Context, sessionID string) (*Goal, error) {
	var out struct {
		Goal *Goal `json:"goal"`
	}
	if err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/goal"), nil, &out); err != nil {
		return nil, err
	}
	return out.Goal, nil
}

// GoalAction applies pause, resume or clear to the session goal.
func (c *Client) GoalAction(ctx context.Context, sessionID, action string) error {
	body := map[string]string{"action": action}
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/goal"), body, nil)
}
