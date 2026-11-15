package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestMagpiePortReadsSettings(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	settingsDir := filepath.Join(dir, "magpie")
	if err := os.MkdirAll(settingsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(settingsDir, "settings.json"), []byte(`{"port": 4000}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := magpiePort(); got != 4000 {
		t.Fatalf("port = %d, want 4000", got)
	}
	if got := magpieGatewayURL(); got != "http://127.0.0.1:4000" {
		t.Fatalf("gateway URL = %q", got)
	}
}

func TestMagpiePortFallsBack(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	if got := magpiePort(); got != magpieDefaultPort {
		t.Fatalf("port = %d, want %d", got, magpieDefaultPort)
	}
}

func TestFetchProviderModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer magpie-lingzhu" {
			t.Errorf("authorization = %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{
				map[string]any{
					"id": "deepseek/deepseek-chat", "display_name": "DeepSeek Chat", "magpie_label": "DeepSeek Chat · DeepSeek",
					"context_window": 128000, "max_output_tokens": 8192, "tool_call": true, "reasoning": true,
					"reasoning_levels": []any{"low", "high"},
					"modalities":       map[string]any{"input": []any{"text", "image"}, "output": []any{"text"}},
				},
				map[string]any{"id": "relay/glm-5", "display_name": "GLM-5"},
				map[string]any{"id": "claude/claude-sonnet-5"},
				map[string]any{"id": "deepseek/deepseek-chat"},
			},
		})
	}))
	defer server.Close()

	models, err := fetchProviderModels(server.URL+"/v1", "magpie-lingzhu")
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 3 {
		t.Fatalf("models = %+v", models)
	}
	if models[0].ID != "deepseek/deepseek-chat" || models[0].Name != "DeepSeek Chat · DeepSeek" || models[0].ContextWindow != 128000 {
		t.Fatalf("first model = %+v", models[0])
	}
	if models[0].MaxOutputTokens != 8192 || !models[0].Attachment || !models[0].Reasoning || models[0].ToolCall == nil || !*models[0].ToolCall {
		t.Fatalf("first model metadata = %+v", models[0])
	}
	if models[0].Variants["high"]["reasoning_effort"] != "high" || len(models[0].Variants) != 2 {
		t.Fatalf("first model variants = %+v", models[0].Variants)
	}
	if models[1].ID != "relay/glm-5" || models[1].Name != "GLM-5" {
		t.Fatalf("second model = %+v", models[1])
	}
	if models[2].ID != "claude/claude-sonnet-5" || models[2].Name != "claude/claude-sonnet-5" {
		t.Fatalf("third model = %+v", models[2])
	}
}

func TestFetchProviderModelsRepairsMojibakeLabel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{
				map[string]any{
					"id": "deepseek/deepseek-chat", "display_name": "DeepSeek Chat",
					"magpie_label": "DeepSeek Chat 路 DeepSeek",
				},
			},
		})
	}))
	defer server.Close()

	models, err := fetchProviderModels(server.URL+"/v1", "magpie-lingzhu")
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 1 || models[0].Name != "DeepSeek Chat · DeepSeek" {
		t.Fatalf("mojibake label was not repaired: %+v", models)
	}
}

func TestNormalizeModelLabelKeepsOtherChineseText(t *testing.T) {
	if got := normalizeModelLabel("道路模型"); got != "道路模型" {
		t.Fatalf("unrelated 路 was rewritten: %q", got)
	}
}

func TestEnrichProviderModelsUsesGatewayLabels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{
				map[string]any{
					"id": "trae-cn/deepseek-chat", "display_name": "DeepSeek Chat", "magpie_label": "DeepSeek Chat · Trae CN",
					"context_window": 1000, "max_output_tokens": 8192, "tool_call": false, "reasoning": true,
					"supported_reasoning_levels": []any{map[string]any{"effort": "high"}},
					"modalities":                 map[string]any{"input": []any{"text", "image"}, "output": []any{"text"}},
				},
				map[string]any{"id": "relay/glm-5", "display_name": "GLM-5", "magpie_label": "GLM-5 · Relay"},
			},
		})
	}))
	defer server.Close()

	settings := AppSettings{Providers: []ProviderSettings{{
		ID:      "magpie",
		BaseURL: server.URL + "/v1",
		Models: []ModelSettings{
			{ID: "trae-cn/deepseek-chat", Name: "DeepSeek Chat", ContextWindow: 128000},
			{ID: "relay/glm-5", Name: "My GLM", ContextWindow: 64000},
		},
	}}}
	file := map[string]any{"providers": map[string]any{
		"magpie": map[string]any{"api_key": "test-key"},
	}}

	enrichProviderModels(&settings, file, server.URL+"/v1")
	if model := settings.Providers[0].Models[0]; model.Name != "DeepSeek Chat · Trae CN" || model.ContextWindow != 1000 ||
		model.MaxOutputTokens != 8192 || model.ToolCall == nil || *model.ToolCall || !model.Reasoning || !model.Attachment ||
		model.Variants["high"]["reasoning_effort"] != "high" {
		t.Fatalf("plain model = %+v", model)
	}
	if model := settings.Providers[0].Models[1]; model.Name != "My GLM" {
		t.Fatalf("custom model = %+v", model)
	}
}

func TestFetchProviderModelsRejectsBadKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	if _, err := fetchProviderModels(server.URL+"/v1", "wrong"); err == nil {
		t.Fatal("expected a rejected key error")
	}
}
