package service

import "lingzhu-app/internal/core"

// Providers lists the core's configured providers without credentials.
func (s *CoreService) Providers(workspace string) ([]core.ProviderInfo, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.ProviderInfo, error) {
		return client.Providers(s.ctx)
	})
}

// Provider returns one configured provider.
func (s *CoreService) Provider(workspace, id string) (core.ProviderInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ProviderInfo, error) {
		return client.Provider(s.ctx, id)
	})
}

// Models lists every selectable model across providers.
func (s *CoreService) Models(workspace string) ([]core.ModelInfo, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.ModelInfo, error) {
		return client.Models(s.ctx)
	})
}

// DefaultModel returns the core's default model selection.
func (s *CoreService) DefaultModel(workspace string) (*core.ModelInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (*core.ModelInfo, error) {
		return client.DefaultModel(s.ctx)
	})
}

// Config returns the sanitized effective core configuration.
func (s *CoreService) Config(workspace string) (core.ConfigView, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ConfigView, error) {
		return client.Config(s.ctx)
	})
}

// UpdateConfig persists supported fields in the core config file.
func (s *CoreService) UpdateConfig(workspace string, patch map[string]any) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.UpdateConfig(s.ctx, patch)
	})
}
