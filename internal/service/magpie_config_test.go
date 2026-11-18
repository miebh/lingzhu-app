package service

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// The startup sync must bring a stale gateway list up to date on disk, so the
// core started afterwards resolves the gateway's current models.
func TestSyncGatewayConfigWritesOnStartup(t *testing.T) {
	gateway := gatewayServer(t, []map[string]any{
		{"id": "new/c", "display_name": "C", "context_window": 4000},
	})
	resetMagpieCatalog(t)
	pointMagpieAt(t, gateway)

	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	file := document{
		"provider": "magpie",
		"model":    "old/a",
		"providers": map[string]any{
			"magpie": map[string]any{
				"base_url": gateway + "/v1",
				"api_key":  "magpie-lingzhu",
				"models": []any{
					map[string]any{"id": "old/a", "name": "A", "context_window": 1000, "enabled": true},
				},
				"gateway_models": []any{"old/a"},
			},
		},
	}
	writeDocument(t, path, file)

	service := &CoreService{configPath: path}
	service.syncGatewayConfig()

	stored := readDocument(t, path)
	entry, _ := asDocument(stored.object("providers")["magpie"])
	models := entry.objects("models")
	if len(models) != 1 || models[0].str("id") != "new/c" {
		t.Fatalf("startup sync should store the gateway's list: %+v", models)
	}
	if stored.str("model") != "new/c" {
		t.Fatalf("startup sync should repair the default model: %q", stored.str("model"))
	}
}

// pointMagpieAt writes a magpie settings file whose port matches the stub
// gateway, so the code under test finds it the way it finds the real one.
func pointMagpieAt(t *testing.T, gateway string) {
	t.Helper()
	parsed, err := url.Parse(gateway)
	if err != nil {
		t.Fatal(err)
	}
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)
	dir := filepath.Join(configHome, "magpie")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(parsed.Port())
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(map[string]any{"port": port})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

// A config with no gateway provider must not be rewritten at startup.
func TestSyncGatewayConfigLeavesOtherConfigsAlone(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	writeDocument(t, path, document{
		"provider": "openai",
		"model":    "gpt-4.1",
		"providers": map[string]any{
			"openai": map[string]any{
				"base_url": "https://api.openai.com/v1",
				"api_key":  "sk-test",
				"models":   []any{map[string]any{"id": "gpt-4.1", "name": "GPT-4.1"}},
			},
		},
	})
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	service := &CoreService{configPath: path}
	service.syncGatewayConfig()

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("a config without a gateway provider must not change")
	}
}

// A gateway that is down must leave the stored list untouched, so an offline
// start never empties the config.
func TestSyncGatewayConfigSurvivesGatewayDown(t *testing.T) {
	resetMagpieCatalog(t)
	pointMagpieAt(t, "http://127.0.0.1:1")

	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	writeDocument(t, path, document{
		"provider": "magpie",
		"model":    "kept/a",
		"providers": map[string]any{
			"magpie": map[string]any{
				"base_url": "http://127.0.0.1:1/v1",
				"api_key":  "magpie-lingzhu",
				"models":   []any{map[string]any{"id": "kept/a", "name": "A", "context_window": 1000, "enabled": true}},
			},
		},
	})
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	service := &CoreService{configPath: path}
	service.syncGatewayConfig()

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("a gateway that is down must not rewrite the config")
	}
}

// A settings read projects the gateway's current catalog, so a config with a
// stale gateway list must not be rewritten just because a dialog opened.
func TestSettingsProjectionDoesNotWrite(t *testing.T) {
	gateway := gatewayServer(t, []map[string]any{
		{"id": "new/c", "display_name": "C", "context_window": 4000},
	})
	resetMagpieCatalog(t)
	pointMagpieAt(t, gateway)

	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	writeDocument(t, path, document{
		"provider": "magpie",
		"model":    "old/a",
		"providers": map[string]any{
			"magpie": map[string]any{
				"base_url": gateway + "/v1",
				"api_key":  "magpie-lingzhu",
				"models": []any{
					map[string]any{"id": "old/a", "name": "A", "context_window": 1000},
				},
				"gateway_models": []any{"old/a"},
			},
		},
	})
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	service := &CoreService{configPath: path}
	settings, err := service.Settings()
	if err != nil {
		t.Fatal(err)
	}
	if len(settings.Providers) != 1 || len(settings.Providers[0].Models) != 1 ||
		settings.Providers[0].Models[0].ID != "new/c" {
		t.Fatalf("the read should project the gateway's list: %+v", settings.Providers)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("a settings read must not rewrite the config")
	}
}

// A discovery pass reconciles the gateway, persists the result, and pushes the
// projection; a second pass with the same answer stays quiet.
func TestPollGatewayModelsWritesAndEmitsOnce(t *testing.T) {
	gateway := gatewayServer(t, []map[string]any{
		{"id": "new/c", "display_name": "C", "context_window": 4000},
	})
	resetMagpieCatalog(t)
	pointMagpieAt(t, gateway)

	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	writeDocument(t, path, document{
		"provider": "magpie",
		"model":    "old/a",
		"providers": map[string]any{
			"magpie": map[string]any{
				"base_url": gateway + "/v1",
				"api_key":  "magpie-lingzhu",
				"models": []any{
					map[string]any{"id": "old/a", "name": "A", "context_window": 1000},
				},
				"gateway_models": []any{"old/a"},
			},
		},
	})

	service := &CoreService{configPath: path}
	var emitted []AppSettings
	service.emitCatalogSettings = func(settings AppSettings) { emitted = append(emitted, settings) }

	service.pollGatewayModels()

	stored := readDocument(t, path)
	entry, _ := asDocument(stored.object("providers")["magpie"])
	models := entry.objects("models")
	if len(models) != 1 || models[0].str("id") != "new/c" {
		t.Fatalf("the pass should store the gateway's list: %+v", models)
	}
	if stored.str("model") != "new/c" {
		t.Fatalf("the pass should repair the default model: %q", stored.str("model"))
	}
	if len(emitted) != 1 || len(emitted[0].Providers) != 1 ||
		len(emitted[0].Providers[0].Models) != 1 || emitted[0].Providers[0].Models[0].ID != "new/c" {
		t.Fatalf("a changed catalog should be pushed once: %+v", emitted)
	}

	service.pollGatewayModels()
	if len(emitted) != 1 {
		t.Fatalf("an unchanged catalog should not be pushed again: %+v", emitted)
	}
}

// A manual save must keep the sync's bookkeeping, so the next sync still knows
// which models came from the gateway.
func TestSaveSettingsKeepsGatewayBookkeeping(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	writeDocument(t, path, document{
		"provider": "magpie",
		"model":    "a/one",
		"providers": map[string]any{
			"magpie": map[string]any{
				"base_url":       "http://127.0.0.1:3425/v1",
				"api_key":        "magpie-lingzhu",
				"models":         []any{map[string]any{"id": "a/one", "name": "One"}},
				"gateway_models": []any{"a/one", "withdrawn/b"},
			},
		},
	})
	file := readDocument(t, path)
	settings := buildAppSettings(path, file)
	input := settingsInputFromSettings(settings)
	applySettingsInput(file, input)
	writeDocument(t, path, file)

	stored := readDocument(t, path)
	entry, _ := asDocument(stored.object("providers")["magpie"])
	recorded := entry.strings(gatewayModelsKey)
	if len(recorded) != 2 || recorded[1] != "withdrawn/b" {
		t.Fatalf("a manual save dropped the gateway bookkeeping: %+v", recorded)
	}
}

func writeDocument(t *testing.T, path string, file document) {
	t.Helper()
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func readDocument(t *testing.T, path string) document {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	file := document{}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	return file
}
