package service

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExplicitEmptyProvidersStayEmpty(t *testing.T) {
	file := document{"providers": map[string]any{}, "provider": "", "model": ""}
	settings := buildAppSettings("config.json", file)
	if len(settings.Providers) != 0 || settings.Provider != "" || settings.Model != "" {
		t.Fatalf("settings = %+v", settings)
	}
	if err := validateSettingsInput(SettingsInput{
		MaxSteps: 1, ContextWindow: 0, CompactKeep: 1,
	}); err != nil {
		t.Fatalf("empty provider input rejected: %v", err)
	}
}

func TestBuildAppSettingsReadsProviderBlock(t *testing.T) {
	t.Setenv("TEST_PROVIDER_KEY", "from-env")
	file := document{
		"provider": "b",
		"model":    "m2",
		"providers": map[string]any{
			"b": map[string]any{
				"name":        "B",
				"base_url":    "https://b.test/v1",
				"api_key_env": "TEST_PROVIDER_KEY",
				"models": []any{
					map[string]any{"id": "m2", "name": "M2", "context_window": float64(1000)},
				},
			},
			"a": map[string]any{
				"base_url": "https://a.test/v1",
				"api_key":  "secret",
				"models": []any{
					map[string]any{"id": "m1"},
				},
			},
		},
	}
	settings := buildAppSettings("config.json", file)
	if settings.Provider != "b" || settings.Model != "m2" {
		t.Fatalf("unexpected selection: %+v", settings)
	}
	if len(settings.Providers) != 2 || settings.Providers[0].ID != "a" || settings.Providers[1].ID != "b" {
		t.Fatalf("providers should be sorted: %+v", settings.Providers)
	}
	if !settings.Providers[1].Ready {
		t.Fatal("env key should make the provider ready")
	}
	if settings.Providers[1].Models[0].ContextWindow != 1000 {
		t.Fatalf("model window was not read: %+v", settings.Providers[1].Models)
	}
}

func TestApplySettingsClearsKey(t *testing.T) {
	file := document{
		"providers": map[string]any{
			"p": map[string]any{"base_url": "https://p.test/v1", "api_key": "old"},
		},
	}
	applySettingsInput(file, SettingsInput{
		Provider:      "p",
		Model:         "m",
		MaxSteps:      4,
		ContextWindow: 1000,
		CompactKeep:   100,
		Providers: []ProviderInput{{
			ID:       "p",
			BaseURL:  "https://p.test/v1",
			ClearKey: true,
			Models:   []ModelInput{{ID: "m"}},
		}},
	})
	providers, _ := asDocument(file["providers"])
	entry, _ := asDocument(providers["p"])
	if _, ok := entry["api_key"]; ok {
		t.Fatal("cleared key should be removed")
	}
}

func TestValidateRejectsModelOutsideProvider(t *testing.T) {
	err := validateSettingsInput(SettingsInput{
		Provider:      "p",
		Model:         "missing",
		MaxSteps:      1,
		ContextWindow: 0,
		CompactKeep:   1,
		Providers: []ProviderInput{{
			ID:      "p",
			BaseURL: "https://p.test/v1",
			Models:  []ModelInput{{ID: "m"}},
		}},
	})
	if err == nil || !strings.Contains(err.Error(), "has no model") {
		t.Fatalf("want missing model error, got %v", err)
	}
}

func TestTestProviderUsesSavedKeyAndReportsModels(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if r.URL.Path != "/models" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"a"},{"id":"b"}]}`))
	}))
	defer server.Close()

	file := document{
		"providers": map[string]any{
			"p": map[string]any{"base_url": server.URL, "api_key": "stored"},
		},
	}
	path := filepath.Join(t.TempDir(), "config.json")
	if err := writeConfigFile(path, file); err != nil {
		t.Fatal(err)
	}
	service := &CoreService{configPath: path}
	message, err := service.TestProvider("p", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(message, "2 models") {
		t.Fatalf("unexpected message: %q", message)
	}
	if gotAuth != "Bearer stored" {
		t.Fatalf("saved key was not used: %q", gotAuth)
	}
}

func TestTestProviderRejectsBadKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer server.Close()

	service := &CoreService{configPath: filepath.Join(t.TempDir(), "config.json")}
	if err := os.WriteFile(service.configPath, []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := service.TestProvider("p", server.URL, "bad", ""); err == nil {
		t.Fatal("want key rejection")
	}
}
