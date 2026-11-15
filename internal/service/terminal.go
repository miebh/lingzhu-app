package service

import "lingzhu-app/internal/core"

// CreateShell runs a one-shot command.
func (s *CoreService) CreateShell(workspace string, input core.ShellCreate) (core.ShellInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ShellInfo, error) {
		return client.CreateShell(s.ctx, input)
	})
}

// ShellOutput pages through captured output.
func (s *CoreService) ShellOutput(workspace, id string, cursor, limit int64) (core.ShellOutput, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ShellOutput, error) {
		return client.ShellOutput(s.ctx, id, cursor, limit)
	})
}
