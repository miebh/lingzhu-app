package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A model the gateway added must reach the stored list, and one it withdrew
// must leave it, so the core's catalog follows the gateway.
func TestReconcileGatewayModelsAddsAndRemoves(t *testing.T) {
	current := []ModelSettings{
		{ID: "old/a", Name: "A", ContextWindow: 1000, Enabled: true},
		{ID: "kept/b", Name: "B", ContextWindow: 2000, Enabled: false},
	}
	synced := []string{"old/a", "kept/b"}
	models := []PresetModel{
		{ID: "kept/b", Name: "B · Gateway", ContextWindow: 3000},
		{ID: "new/c", Name: "C · Gateway", ContextWindow: 4000, MaxOutputTokens: 8192},
	}

	out := reconcileGatewayModels(current, synced, models)
	if len(out) != 2 {
		t.Fatalf("expected the gateway's two models, got %+v", out)
	}
	if out[0].ID != "kept/b" || out[0].ContextWindow != 3000 || out[0].Enabled {
		t.Fatalf("an existing model must keep its switch and take new metadata: %+v", out[0])
	}
	if out[0].Name != "B · Gateway" {
		t.Fatalf("a plain stored name should follow the gateway label: %+v", out[0])
	}
	if out[1].ID != "new/c" || out[1].ContextWindow != 4000 || !out[1].Enabled || out[1].MaxOutputTokens != 8192 {
		t.Fatalf("a new model must arrive enabled with its metadata: %+v", out[1])
	}
}

// A model the user added by hand was never in a previous sync, so the gateway
// not listing it must not remove it.
func TestReconcileGatewayModelsKeepsUserAddedModel(t *testing.T) {
	current := []ModelSettings{
		{ID: "gateway/a", Name: "A · Gateway", Enabled: true},
		{ID: "hand/b", Name: "My B", Enabled: true},
	}
	synced := []string{"gateway/a"}
	models := []PresetModel{{ID: "gateway/a", Name: "A · Gateway"}}

	out := reconcileGatewayModels(current, synced, models)
	if len(out) != 2 {
		t.Fatalf("a hand-added model must stay, got %+v", out)
	}
	if out[1].ID != "hand/b" || out[1].Name != "My B" {
		t.Fatalf("the hand-added model changed: %+v", out[1])
	}
}

// A config written before the sync kept a record has no list of gateway ids, so
// a withdrawn model is recognised by its gateway label instead.
func TestReconcileGatewayModelsJudgesUnrecordedConfigByLabel(t *testing.T) {
	current := []ModelSettings{
		{ID: "gone/a", Name: "A · Old Provider", Enabled: true},
		{ID: "hand/b", Name: "My B", Enabled: true},
	}
	models := []PresetModel{{ID: "new/c", Name: "C · Gateway"}}

	out := reconcileGatewayModels(current, nil, models)
	if len(out) != 2 {
		t.Fatalf("expected the gateway model plus the hand-added one, got %+v", out)
	}
	if out[0].ID != "new/c" {
		t.Fatalf("the gateway model should come first: %+v", out[0])
	}
	if out[1].ID != "hand/b" {
		t.Fatalf("the unlabeled hand-added model should stay: %+v", out[1])
	}
	for _, item := range out {
		if item.ID == "gone/a" {
			t.Fatalf("a withdrawn labeled model should be dropped: %+v", out)
		}
	}
}

// A name the user typed must survive a sync, while its metadata still updates.
func TestReconcileGatewayModelsKeepsCustomName(t *testing.T) {
	current := []ModelSettings{{ID: "gateway/a", Name: "My A", ContextWindow: 1}}
	models := []PresetModel{{ID: "gateway/a", Name: "A · Gateway", ContextWindow: 9000}}

	out := reconcileGatewayModels(current, []string{"gateway/a"}, models)
	if out[0].Name != "My A" {
		t.Fatalf("a custom name must stay: %+v", out[0])
	}
	if out[0].ContextWindow != 9000 {
		t.Fatalf("metadata should still update: %+v", out[0])
	}
}

// An empty gateway answer leaves the stored list alone, so a gateway that
// answers with nothing cannot wipe the config.
func TestReconcileGatewayModelsKeepsListWhenGatewayIsEmpty(t *testing.T) {
	current := []ModelSettings{{ID: "gateway/a", Name: "A"}}
	out := reconcileGatewayModels(current, nil, nil)
	if len(out) != 1 || out[0].ID != "gateway/a" {
		t.Fatalf("an empty gateway answer must not clear the list: %+v", out)
	}
}

// The sync writes the reconciled list, records what the gateway advertised, and
// repairs a default selection that pointed at a withdrawn model.
func TestSyncGatewayModelsWritesFileAndRepairsSelection(t *testing.T) {
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{
				map[string]any{"id": "new/c", "display_name": "C", "context_window": 4000},
			},
		})
	}))
	defer gateway.Close()
	resetMagpieCatalog(t)

	file := document{
		"provider": "magpie",
		"model":    "old/a",
		"providers": map[string]any{
			"magpie": map[string]any{
				"base_url": gateway.URL + "/v1",
				"api_key":  "magpie-lingzhu",
				"models": []any{
					map[string]any{"id": "old/a", "name": "A", "context_window": 1000, "enabled": true},
				},
				"gateway_models": []any{"old/a"},
			},
		},
	}

	if !syncGatewayProvider(file, gateway.URL+"/v1") {
		t.Fatal("expected the file to change")
	}
	entry, _ := asDocument(file.object("providers")["magpie"])
	models := entry.objects("models")
	if len(models) != 1 || models[0].str("id") != "new/c" {
		t.Fatalf("the withdrawn model should be replaced by the gateway's: %+v", models)
	}
	if file.str("model") != "new/c" {
		t.Fatalf("the default selection should follow the new list: %q", file.str("model"))
	}
	if recorded := entry.strings(gatewayModelsKey); len(recorded) != 1 || recorded[0] != "new/c" {
		t.Fatalf("the advertised ids should be recorded: %+v", recorded)
	}
}

// A second sync with an unchanged gateway must not rewrite the file.
func TestSyncGatewayModelsIsIdempotent(t *testing.T) {
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{map[string]any{"id": "a/one", "display_name": "One", "context_window": 1000}},
		})
	}))
	defer gateway.Close()
	resetMagpieCatalog(t)

	file := document{
		"provider": "magpie",
		"model":    "a/one",
		"providers": map[string]any{
			"magpie": map[string]any{
				"base_url": gateway.URL + "/v1",
				"api_key":  "magpie-lingzhu",
			},
		},
	}
	if !syncGatewayProvider(file, gateway.URL+"/v1") {
		t.Fatal("the first sync should write")
	}
	if syncGatewayProvider(file, gateway.URL+"/v1") {
		t.Fatal("a second sync with no gateway change must not write again")
	}
}

// A provider that does not point at the gateway is left alone.
func TestSyncGatewayModelsIgnoresOtherProviders(t *testing.T) {
	resetMagpieCatalog(t)
	file := document{
		"providers": map[string]any{
			"openai": map[string]any{
				"base_url": "https://api.openai.com/v1",
				"api_key":  "sk-test",
				"models":   []any{map[string]any{"id": "gpt-4.1", "name": "GPT-4.1"}},
			},
		},
	}
	if syncGatewayProvider(file, "http://127.0.0.1:1/v1") {
		t.Fatal("a non-gateway provider must not change")
	}
}

// resetMagpieCatalog clears the short-lived gateway cache so each test sees its
// own server.
func resetMagpieCatalog(t *testing.T) {
	t.Helper()
	magpieCatalogCache.Lock()
	magpieCatalogCache.key = ""
	magpieCatalogCache.at = time.Time{}
	magpieCatalogCache.models = nil
	magpieCatalogCache.Unlock()
}

// gatewayServer starts a stub gateway that advertises the given models.
func gatewayServer(t *testing.T, models []map[string]any) string {
	t.Helper()
	items := make([]any, 0, len(models))
	for _, model := range models {
		items = append(items, model)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"data": items})
	}))
	t.Cleanup(server.Close)
	return server.URL
}
