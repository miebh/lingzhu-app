package service

import "testing"

const catalogFixture = `{
  "acme": {
    "id": "acme",
    "name": "Acme",
    "env": ["ACME_API_KEY"],
    "models": {
      "chat-a": {
        "id": "chat-a",
        "type": "chat",
        "name": "Chat A",
        "modalities": {"input": ["text", "image/png"], "output": ["text"]},
        "capabilities": {"tools": {"supported": true}, "reasoning": {"supported": true, "effort": ["low", "high"], "toggle": true}},
        "limit": {"context": 1000, "output": 100},
        "cost": {"text": {"input": {"price": 1.5, "cache": {"read": 0.15, "write": {"5m": 2}}}, "output": {"price": 3}}},
        "api": {"chat-completions": {"base_url": "https://a.test/v1"}}
      },
      "chat-b": {
        "id": "chat-b",
        "type": "chat",
        "name": "Chat B",
        "api": {"chat-completions": {"base_url": "https://other.test/v1"}}
      },
      "image-a": {
        "id": "image-a",
        "type": "image",
        "name": "Image A",
        "api": {"chat-completions": {"base_url": "https://a.test/v1"}}
      }
    }
  },
  "local": {
    "id": "local",
    "name": "Local",
    "env": [],
    "models": {
      "small": {
        "id": "small",
        "type": "chat",
        "name": "Small",
        "api": {"chat-completions": {"base_url": "http://127.0.0.1:1234/v1"}}
      }
    }
  },
  "oauth-only": {
    "id": "oauth-only",
    "name": "OAuth Only",
    "env": [],
    "models": {
      "remote": {
        "id": "remote",
        "type": "chat",
        "name": "Remote",
        "api": {"chat-completions": {"base_url": "https://remote.test/v1"}}
      }
    }
  }
}`

func TestParseCatalogBuildsPresets(t *testing.T) {
	presets, err := parseCatalog([]byte(catalogFixture))
	if err != nil {
		t.Fatal(err)
	}
	if len(presets) != 2 {
		t.Fatalf("presets = %+v", presets)
	}
	byID := map[string]ProviderPreset{}
	for _, preset := range presets {
		byID[preset.ID] = preset
	}
	acme, ok := byID["acme"]
	if !ok {
		t.Fatal("acme missing")
	}
	if acme.BaseURL != "https://a.test/v1" || acme.APIKeyEnv != "ACME_API_KEY" {
		t.Fatalf("acme = %+v", acme)
	}
	if len(acme.Models) != 1 || acme.Models[0].ID != "chat-a" {
		t.Fatalf("acme models = %+v", acme.Models)
	}
	model := acme.Models[0]
	if model.ContextWindow != 1000 || model.MaxOutputTokens != 100 || !model.Attachment || !model.Reasoning {
		t.Fatalf("model metadata = %+v", model)
	}
	if model.ToolCall == nil || !*model.ToolCall {
		t.Fatalf("tool call = %+v", model.ToolCall)
	}
	if model.Cost == nil || model.Cost.Input != 1.5 || model.Cost.Output != 3 || model.Cost.CacheRead != 0.15 || model.Cost.CacheWrite != 2 {
		t.Fatalf("cost = %+v", model.Cost)
	}
	if got := model.Variants["low"]["reasoning_effort"]; got != "low" {
		t.Fatalf("low variant = %+v", model.Variants)
	}
	if _, ok := model.Variants["high"]; !ok {
		t.Fatalf("high variant missing: %+v", model.Variants)
	}
	if _, ok := model.Variants[variantThinking]; !ok {
		t.Fatalf("toggle variant missing: %+v", model.Variants)
	}

	local, ok := byID["local"]
	if !ok {
		t.Fatal("local missing")
	}
	if local.APIKeyEnv != "" || local.DefaultAPIKey != "local" {
		t.Fatalf("local = %+v", local)
	}
	if _, ok := byID["oauth-only"]; ok {
		t.Fatal("remote provider without a key variable should be skipped")
	}
}

func TestMergePresetFillsMetadataAndAppendsModels(t *testing.T) {
	base := ProviderPreset{
		ID:        "acme",
		Name:      "Acme",
		BaseURL:   "https://preset.test/v1",
		APIKeyEnv: "PRESET_KEY",
		Models:    []PresetModel{{ID: "chat-a"}},
	}
	catalog := ProviderPreset{
		ID:      "acme",
		BaseURL: "https://a.test/v1",
		Models: []PresetModel{
			{
				ID: "chat-a", Name: "Chat A", ContextWindow: 1000, MaxOutputTokens: 100,
				Variants: map[string]map[string]any{"high": {"reasoning_effort": "high"}},
			},
			{ID: "chat-b", Name: "Chat B", ContextWindow: 2000},
		},
	}
	merged := mergePreset(base, catalog)
	if merged.BaseURL != base.BaseURL || merged.APIKeyEnv != base.APIKeyEnv {
		t.Fatalf("endpoint changed: %+v", merged)
	}
	if len(merged.Models) != 2 {
		t.Fatalf("models = %+v", merged.Models)
	}
	if merged.Models[0].ContextWindow != 1000 || merged.Models[0].Name != "Chat A" {
		t.Fatalf("metadata not filled: %+v", merged.Models[0])
	}
	if merged.Models[0].Variants["high"]["reasoning_effort"] != "high" {
		t.Fatalf("variants not filled: %+v", merged.Models[0].Variants)
	}
	if merged.Models[1].ID != "chat-b" {
		t.Fatalf("catalog model not appended: %+v", merged.Models[1])
	}
}

func TestEnrichCatalogModelsKeepsExistingValues(t *testing.T) {
	catalogCache.Lock()
	oldLoaded, oldAt, oldPresets, oldSource := catalogCache.loaded, catalogCache.at, catalogCache.presets, catalogCache.source
	catalogCache.loaded = true
	catalogCache.Unlock()
	defer func() {
		catalogCache.Lock()
		catalogCache.loaded, catalogCache.at, catalogCache.presets, catalogCache.source = oldLoaded, oldAt, oldPresets, oldSource
		catalogCache.Unlock()
	}()
	catalogCache.presets = []ProviderPreset{{
		ID:      "acme",
		BaseURL: "https://a.test/v1",
		Models: []PresetModel{{
			ID:            "chat-a",
			ContextWindow: 1000,
			Reasoning:     true,
			Variants:      map[string]map[string]any{"high": {"reasoning_effort": "high"}},
		}},
	}}

	settings := AppSettings{Providers: []ProviderSettings{{
		ID:      "acme",
		BaseURL: "https://a.test/v1",
		Models:  []ModelSettings{{ID: "chat-a", ContextWindow: 64000}},
	}}}
	enrichCatalogModels(&settings)
	model := settings.Providers[0].Models[0]
	if model.ContextWindow != 64000 || !model.Reasoning || model.Variants["high"]["reasoning_effort"] != "high" {
		t.Fatalf("model = %+v", model)
	}
}
