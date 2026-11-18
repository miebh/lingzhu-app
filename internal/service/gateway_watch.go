package service

import (
	"context"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	// gatewayWatchInterval is how often the app checks the local gateway's
	// catalog. It matches the gateway's own discovery cadence, so a model added
	// or withdrawn in the dashboard appears within one tick instead of waiting
	// for a dialog to read the config when it opens.
	gatewayWatchInterval = 30 * time.Second
	// catalogEventChannel tells the webview that the projected provider catalog
	// changed, so every surface reads the same list.
	catalogEventChannel = "lingzhu:catalog"
)

// watchGatewayModels keeps gateway-backed providers in step with the gateway for
// the life of the app: a changed list is written, idle cores are restarted, and
// the new catalog is pushed to the window.
func (s *CoreService) watchGatewayModels(ctx context.Context) {
	ticker := time.NewTicker(gatewayWatchInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pollGatewayModels()
		}
	}
}

// pollGatewayModels runs one discovery pass. A fetch failure leaves the stored
// list alone, exactly like the startup sync.
func (s *CoreService) pollGatewayModels() {
	file, changed := s.refreshGatewayConfig(true, true)
	if !changed {
		return
	}
	s.emitCatalog(s.projectSettings(file))
}

// emitCatalog publishes the projected catalog through Wails unless a test seam
// replaced the emitter.
func (s *CoreService) emitCatalog(settings AppSettings) {
	if s.emitCatalogSettings != nil {
		s.emitCatalogSettings(settings)
		return
	}
	if app := application.Get(); app != nil {
		app.Event.Emit(catalogEventChannel, settings)
	}
}
