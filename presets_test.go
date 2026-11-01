package main

import "testing"

func TestProviderPresetsAreWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, preset := range providerPresets() {
		if preset.ID == "" || preset.Name == "" {
			t.Fatalf("preset needs an id and name: %+v", preset)
		}
		if seen[preset.ID] {
			t.Fatalf("duplicate preset %q", preset.ID)
		}
		seen[preset.ID] = true
		if err := validHTTPURL(preset.BaseURL); err != nil {
			t.Fatalf("preset %s: %v", preset.ID, err)
		}
		if preset.APIKeyEnv == "" {
			t.Fatalf("preset %s needs an environment variable", preset.ID)
		}
		if len(preset.Models) == 0 {
			t.Fatalf("preset %s has no models", preset.ID)
		}
		models := map[string]bool{}
		for _, model := range preset.Models {
			if model.ID == "" || model.Name == "" {
				t.Fatalf("preset %s has an incomplete model: %+v", preset.ID, model)
			}
			if models[model.ID] {
				t.Fatalf("preset %s repeats model %q", preset.ID, model.ID)
			}
			models[model.ID] = true
			if model.ContextWindow <= 0 {
				t.Fatalf("preset %s model %s needs a positive window", preset.ID, model.ID)
			}
		}
	}
	if len(seen) < 8 {
		t.Fatalf("expected several mainstream presets, got %d", len(seen))
	}
}
