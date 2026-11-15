package service

import (
	"fmt"
	"os"
	"testing"
)

// TestSyncRealGatewayConfig is a manual check against the machine's own config.
// It runs only when LINGZHU_SYNC_CONFIG names a file, and it writes the result
// back so the running app picks it up on its next start.
func TestSyncRealGatewayConfig(t *testing.T) {
	path := os.Getenv("LINGZHU_SYNC_CONFIG")
	if path == "" {
		t.Skip("set LINGZHU_SYNC_CONFIG to a config file to run this check")
	}
	service := &CoreService{configPath: path}
	service.syncGatewayConfig()

	file, err := service.readConfigFile()
	if err != nil {
		t.Fatal(err)
	}
	settings := buildAppSettings(path, file)
	enrichMagpieModels(&settings, file)
	for _, provider := range settings.Providers {
		if !provider.DynamicModels {
			continue
		}
		fmt.Printf("provider %s (%s) dynamic=%v models=%d\n", provider.ID, provider.BaseURL, provider.DynamicModels, len(provider.Models))
		for _, model := range provider.Models {
			fmt.Printf("  %-45s %s\n", model.ID, model.Name)
		}
	}
	fmt.Printf("selected: %s / %s\n", settings.Provider, settings.Model)
}
