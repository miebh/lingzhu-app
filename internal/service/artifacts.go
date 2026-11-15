package service

import "lingzhu-app/internal/core"

// ArtifactProviders lists artifact backends for one workspace.
func (s *CoreService) ArtifactProviders(workspace string) ([]core.ArtifactProvider, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.ArtifactProvider, error) {
		return client.ArtifactProviders(s.ctx)
	})
}

// CreateArtifact publishes a new artifact.
func (s *CoreService) CreateArtifact(workspace string, input core.ArtifactWrite) (core.ArtifactInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ArtifactInfo, error) {
		return client.CreateArtifact(s.ctx, input)
	})
}

// ArtifactFile fetches one raw file of an artifact for inline preview.
func (s *CoreService) ArtifactFile(workspace, id, path string) (core.ArtifactFile, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ArtifactFile, error) {
		return client.ArtifactFile(s.ctx, id, path)
	})
}

// UpdateArtifact replaces an artifact's files at the same id.
func (s *CoreService) UpdateArtifact(workspace, id string, input core.ArtifactWrite) (core.ArtifactInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ArtifactInfo, error) {
		return client.UpdateArtifact(s.ctx, id, input)
	})
}
