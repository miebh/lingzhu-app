package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"
)

// defaultBaseURL matches the core's default OpenAI-compatible endpoint.
const defaultBaseURL = "https://api.openai.com/v1"

// AppSettings is the editable view of the shared core config file. API keys
// never leave the host; each provider only reports whether one is stored.
type AppSettings struct {
	ConfigPath    string             `json:"configPath"`
	Provider      string             `json:"provider"`
	Model         string             `json:"model"`
	Providers     []ProviderSettings `json:"providers"`
	MaxSteps      int                `json:"maxSteps"`
	ContextWindow int                `json:"contextWindow"`
	CompactKeep   int                `json:"compactKeep"`
	SystemPrompt  string             `json:"systemPrompt"`
	Shell         []string           `json:"shell"`
	Permission    []ConfigRule       `json:"permission"`
}

// ConfigRule mirrors one permission rule in the core config file.
type ConfigRule struct {
	Action   string `json:"action"`
	Resource string `json:"resource"`
	Effect   string `json:"effect"`
}

// ProviderSettings is one provider as the client sees it.
type ProviderSettings struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	BaseURL   string          `json:"baseUrl"`
	APIKeySet bool            `json:"apiKeySet"`
	APIKeyEnv string          `json:"apiKeyEnv"`
	Ready     bool            `json:"ready"`
	Models    []ModelSettings `json:"models"`
}

// ModelSettings is one model in a provider.
type ModelSettings struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ContextWindow int    `json:"contextWindow"`
	Enabled       bool   `json:"enabled"`
}

// SettingsInput is the editable core config. An empty APIKey keeps the stored
// key unless ClearKey is set.
type SettingsInput struct {
	Provider      string          `json:"provider"`
	Model         string          `json:"model"`
	Providers     []ProviderInput `json:"providers"`
	MaxSteps      int             `json:"maxSteps"`
	ContextWindow int             `json:"contextWindow"`
	CompactKeep   int             `json:"compactKeep"`
	SystemPrompt  string          `json:"systemPrompt"`
	Shell         []string        `json:"shell"`
	Permission    []ConfigRule    `json:"permission"`
}

// ProviderInput is one provider being saved.
type ProviderInput struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	BaseURL   string       `json:"baseUrl"`
	APIKey    string       `json:"apiKey"`
	APIKeyEnv string       `json:"apiKeyEnv"`
	ClearKey  bool         `json:"clearKey"`
	Models    []ModelInput `json:"models"`
}

// ModelInput is one model being saved.
type ModelInput struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ContextWindow int    `json:"contextWindow"`
	Enabled       bool   `json:"enabled"`
}

// ModelVisibility is one model's picker visibility. The core never reads this
// presentation flag, so changing it does not require a core restart.
type ModelVisibility struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Enabled  bool   `json:"enabled"`
}

func buildAppSettings(configPath string, file map[string]any) AppSettings {
	providers, provider, model := readProviderSettings(file)
	settings := AppSettings{
		ConfigPath:    configPath,
		Provider:      provider,
		Model:         model,
		Providers:     providers,
		MaxSteps:      intSetting(file, "max_steps", defaultMaxSteps),
		ContextWindow: intSetting(file, "context_window", defaultContextWindow),
		CompactKeep:   intSetting(file, "compact_keep", defaultCompactKeep),
		SystemPrompt:  stringSetting(file, "system_prompt"),
		Shell:         []string{},
		Permission:    []ConfigRule{},
	}
	if raw, ok := file["shell"].([]any); ok {
		for _, item := range raw {
			if part, ok := item.(string); ok {
				settings.Shell = append(settings.Shell, part)
			}
		}
	}
	if raw, ok := file["permission"].([]any); ok {
		for _, item := range raw {
			entry, ok := item.(map[string]any)
			if !ok {
				continue
			}
			settings.Permission = append(settings.Permission, ConfigRule{
				Action:   stringSetting(entry, "action"),
				Resource: stringSetting(entry, "resource"),
				Effect:   stringSetting(entry, "effect"),
			})
		}
	}
	return settings
}

// readProviderSettings projects the providers block. Configs without one are
// shown as a single legacy "default" provider so old files stay editable.
func readProviderSettings(file map[string]any) ([]ProviderSettings, string, string) {
	topModel := strings.TrimSpace(stringSetting(file, "model"))
	fallbackWindow := intSetting(file, "context_window", defaultContextWindow)
	raw, _ := file["providers"].(map[string]any)
	if len(raw) == 0 {
		return legacyProvider(file, topModel, fallbackWindow), "default", topModel
	}

	ids := make([]string, 0, len(raw))
	for id := range raw {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	providers := make([]ProviderSettings, 0, len(ids))
	for _, id := range ids {
		entry, ok := raw[id].(map[string]any)
		if !ok {
			continue
		}
		name := stringSetting(entry, "name")
		if name == "" {
			name = id
		}
		baseURL := stringSetting(entry, "base_url")
		env := stringSetting(entry, "api_key_env")
		keySet := stringSetting(entry, "api_key") != "" || (env != "" && os.Getenv(env) != "")
		models := []ModelSettings{}
		if rawModels, ok := entry["models"].([]any); ok {
			for _, item := range rawModels {
				model, ok := item.(map[string]any)
				if !ok {
					continue
				}
				modelID := strings.TrimSpace(stringSetting(model, "id"))
				if modelID == "" {
					continue
				}
				modelName := stringSetting(model, "name")
				if modelName == "" {
					modelName = modelID
				}
				enabled := true
				if value, ok := model["enabled"].(bool); ok {
					enabled = value
				}
				models = append(models, ModelSettings{
					ID:            modelID,
					Name:          modelName,
					ContextWindow: intSetting(model, "context_window", fallbackWindow),
					Enabled:       enabled,
				})
			}
		}
		providers = append(providers, ProviderSettings{
			ID:        id,
			Name:      name,
			BaseURL:   baseURL,
			APIKeySet: keySet,
			APIKeyEnv: env,
			Ready:     baseURL != "" && keySet,
			Models:    models,
		})
	}
	if len(providers) == 0 {
		return legacyProvider(file, topModel, fallbackWindow), "default", topModel
	}

	selected := strings.TrimSpace(stringSetting(file, "provider"))
	if !hasProvider(providers, selected) {
		selected = providers[0].ID
	}
	model := topModel
	if model == "" {
		for _, provider := range providers {
			if provider.ID == selected && len(provider.Models) > 0 {
				model = provider.Models[0].ID
			}
		}
	}
	return providers, selected, model
}

func legacyProvider(file map[string]any, model string, fallbackWindow int) []ProviderSettings {
	baseURL := stringSetting(file, "base_url")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	keySet := stringSetting(file, "api_key") != "" || os.Getenv("OPENAI_API_KEY") != ""
	models := []ModelSettings{}
	if model != "" {
		models = append(models, ModelSettings{ID: model, Name: model, ContextWindow: fallbackWindow, Enabled: true})
	}
	return []ProviderSettings{{
		ID:        "default",
		Name:      "Default",
		BaseURL:   baseURL,
		APIKeySet: keySet,
		Ready:     keySet,
		Models:    models,
	}}
}

func validateSettingsInput(input SettingsInput) error {
	model := strings.TrimSpace(input.Model)
	if model == "" {
		return errors.New("model is required")
	}
	if input.MaxSteps < 1 {
		return errors.New("max steps must be at least 1")
	}
	if input.ContextWindow < 0 {
		return errors.New("context window cannot be negative")
	}
	if input.CompactKeep < 1 {
		return errors.New("compact keep must be at least 1")
	}
	for _, rule := range input.Permission {
		if strings.TrimSpace(rule.Action) == "" || strings.TrimSpace(rule.Resource) == "" {
			return errors.New("permission rules need an action and a resource")
		}
		if effect := strings.TrimSpace(rule.Effect); effect != "allow" && effect != "ask" && effect != "deny" {
			return fmt.Errorf("unknown permission effect %q", effect)
		}
	}
	if len(input.Providers) == 0 {
		return errors.New("at least one provider is required")
	}
	seen := map[string]bool{}
	inputs := map[string]ProviderInput{}
	for _, provider := range input.Providers {
		id := strings.TrimSpace(provider.ID)
		if id == "" {
			return errors.New("provider id is required")
		}
		if seen[id] {
			return fmt.Errorf("duplicate provider %q", id)
		}
		seen[id] = true
		inputs[id] = provider
		if err := validHTTPURL(strings.TrimSpace(provider.BaseURL)); err != nil {
			return fmt.Errorf("provider %s: %w", id, err)
		}
		modelSeen := map[string]bool{}
		for _, item := range provider.Models {
			modelID := strings.TrimSpace(item.ID)
			if modelID == "" {
				return fmt.Errorf("provider %s: model id is required", id)
			}
			if modelSeen[modelID] {
				return fmt.Errorf("provider %s: duplicate model %q", id, modelID)
			}
			modelSeen[modelID] = true
			if item.ContextWindow < 0 {
				return fmt.Errorf("provider %s: model %s context window cannot be negative", id, modelID)
			}
		}
	}
	providerID := strings.TrimSpace(input.Provider)
	selected, ok := inputs[providerID]
	if !ok {
		return fmt.Errorf("unknown provider %q", providerID)
	}
	for _, item := range selected.Models {
		if strings.TrimSpace(item.ID) == model {
			return nil
		}
	}
	return fmt.Errorf("provider %s has no model %q", providerID, model)
}

func applySettingsInput(file map[string]any, input SettingsInput) {
	model := strings.TrimSpace(input.Model)
	providerID := strings.TrimSpace(input.Provider)

	existing, _ := file["providers"].(map[string]any)
	next := map[string]any{}
	for _, provider := range input.Providers {
		id := strings.TrimSpace(provider.ID)
		entry := map[string]any{}
		if old, ok := existing[id].(map[string]any); ok {
			for key, value := range old {
				entry[key] = value
			}
		}
		name := strings.TrimSpace(provider.Name)
		if name == "" {
			name = id
		}
		entry["name"] = name
		entry["base_url"] = strings.TrimRight(strings.TrimSpace(provider.BaseURL), "/")
		if env := strings.TrimSpace(provider.APIKeyEnv); env != "" {
			entry["api_key_env"] = env
		} else {
			delete(entry, "api_key_env")
		}
		// An empty key keeps the stored one; ClearKey removes it. A legacy
		// top-level key migrates into the default provider on first save.
		if provider.ClearKey {
			delete(entry, "api_key")
		} else if key := strings.TrimSpace(provider.APIKey); key != "" {
			entry["api_key"] = key
		} else if _, ok := entry["api_key"]; !ok && id == "default" {
			if legacy := stringSetting(file, "api_key"); legacy != "" {
				entry["api_key"] = legacy
			}
		}
		models := make([]any, 0, len(provider.Models))
		for _, item := range provider.Models {
			modelID := strings.TrimSpace(item.ID)
			name := strings.TrimSpace(item.Name)
			if name == "" {
				name = modelID
			}
			models = append(models, map[string]any{
				"id":             modelID,
				"name":           name,
				"context_window": item.ContextWindow,
				"enabled":        item.Enabled,
			})
		}
		entry["models"] = models
		next[id] = entry
	}
	file["providers"] = next
	// The selected pair and the provider block are now the only source; drop
	// the legacy duplicates so they cannot drift.
	delete(file, "base_url")
	delete(file, "api_key")
	file["provider"] = providerID
	file["model"] = model

	file["max_steps"] = input.MaxSteps
	file["context_window"] = input.ContextWindow
	file["compact_keep"] = input.CompactKeep
	if prompt := strings.TrimSpace(input.SystemPrompt); prompt == "" {
		delete(file, "system_prompt")
	} else {
		file["system_prompt"] = input.SystemPrompt
	}
	shell := make([]string, 0, len(input.Shell))
	for _, part := range input.Shell {
		if part = strings.TrimSpace(part); part != "" {
			shell = append(shell, part)
		}
	}
	if len(shell) == 0 {
		delete(file, "shell")
	} else {
		file["shell"] = shell
	}
	rules := make([]ConfigRule, 0, len(input.Permission))
	for _, rule := range input.Permission {
		rules = append(rules, ConfigRule{
			Action:   strings.TrimSpace(rule.Action),
			Resource: strings.TrimSpace(rule.Resource),
			Effect:   strings.TrimSpace(rule.Effect),
		})
	}
	if len(rules) == 0 {
		delete(file, "permission")
	} else {
		file["permission"] = rules
	}
}

// settingsInputFromSettings converts the read-only projection back into a save
// payload. API keys stay in the file: an empty key means "keep the stored one".
func settingsInputFromSettings(settings AppSettings) SettingsInput {
	input := SettingsInput{
		Provider:      settings.Provider,
		Model:         settings.Model,
		MaxSteps:      settings.MaxSteps,
		ContextWindow: settings.ContextWindow,
		CompactKeep:   settings.CompactKeep,
		SystemPrompt:  settings.SystemPrompt,
		Shell:         settings.Shell,
		Permission:    settings.Permission,
	}
	for _, provider := range settings.Providers {
		entry := ProviderInput{
			ID:        provider.ID,
			Name:      provider.Name,
			BaseURL:   provider.BaseURL,
			APIKeyEnv: provider.APIKeyEnv,
		}
		for _, model := range provider.Models {
			entry.Models = append(entry.Models, ModelInput{
				ID:            model.ID,
				Name:          model.Name,
				ContextWindow: model.ContextWindow,
				Enabled:       model.Enabled,
			})
		}
		input.Providers = append(input.Providers, entry)
	}
	return input
}

// applyModelVisibilityInput flips the flags on a save payload.
func applyModelVisibilityInput(input *SettingsInput, entries []ModelVisibility) {
	for i := range input.Providers {
		for j := range input.Providers[i].Models {
			for _, entry := range entries {
				if entry.Provider == input.Providers[i].ID && entry.Model == input.Providers[i].Models[j].ID {
					input.Providers[i].Models[j].Enabled = entry.Enabled
				}
			}
		}
	}
}

// applyModelVisibility flips the picker flag in place and reports whether the
// file changed. Unknown providers or models are ignored.
func applyModelVisibility(file map[string]any, entries []ModelVisibility) bool {
	providers, _ := file["providers"].(map[string]any)
	changed := false
	for _, entry := range entries {
		providerID := strings.TrimSpace(entry.Provider)
		modelID := strings.TrimSpace(entry.Model)
		if providerID == "" || modelID == "" {
			continue
		}
		provider, ok := providers[providerID].(map[string]any)
		if !ok {
			continue
		}
		models, _ := provider["models"].([]any)
		for _, item := range models {
			model, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if id, _ := model["id"].(string); strings.TrimSpace(id) != modelID {
				continue
			}
			if current, ok := model["enabled"].(bool); ok && current == entry.Enabled {
				continue
			}
			model["enabled"] = entry.Enabled
			changed = true
		}
	}
	return changed
}

// TestProvider checks that an endpoint answers. It uses the saved key when the
// form has none, and never logs or returns the key.
func (s *CoreService) TestProvider(providerID, baseURL, apiKey, apiKeyEnv string) (string, error) {
	file, err := s.readConfigFile()
	if err != nil {
		return "", err
	}
	providers, _, _ := readProviderSettings(file)
	id := strings.TrimSpace(providerID)
	base := strings.TrimSpace(baseURL)
	for _, provider := range providers {
		if provider.ID != id {
			continue
		}
		if base == "" {
			base = provider.BaseURL
		}
		if apiKeyEnv == "" {
			apiKeyEnv = provider.APIKeyEnv
		}
	}
	if err := validHTTPURL(base); err != nil {
		return "", err
	}
	key := strings.TrimSpace(apiKey)
	if key == "" && strings.TrimSpace(apiKeyEnv) != "" {
		key = os.Getenv(strings.TrimSpace(apiKeyEnv))
	}
	if key == "" {
		key = savedProviderKey(file, id)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(base, "/")+"/models", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("connect: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	status := resp.StatusCode
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return "", fmt.Errorf("provider %s: API key was rejected", resp.Status)
	}
	if status == http.StatusNotFound || status == http.StatusMethodNotAllowed {
		return "Endpoint reachable; model listing is not supported", nil
	}
	if status < 200 || status >= 300 {
		return "", fmt.Errorf("provider %s: %s", resp.Status, snippet(body))
	}
	var payload struct {
		Data []json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &payload) == nil && len(payload.Data) > 0 {
		return fmt.Sprintf("Connected · %d models available", len(payload.Data)), nil
	}
	return "Connected", nil
}

func savedProviderKey(file map[string]any, id string) string {
	if raw, ok := file["providers"].(map[string]any); ok {
		if entry, ok := raw[id].(map[string]any); ok {
			if key := stringSetting(entry, "api_key"); key != "" {
				return key
			}
			if env := stringSetting(entry, "api_key_env"); env != "" {
				return os.Getenv(env)
			}
		}
	}
	if id == "default" {
		if key := stringSetting(file, "api_key"); key != "" {
			return key
		}
		return os.Getenv("OPENAI_API_KEY")
	}
	return ""
}

func validHTTPURL(raw string) error {
	if raw == "" {
		return errors.New("base URL is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return errors.New("base URL must be an absolute http(s) URL")
	}
	return nil
}

func hasProvider(providers []ProviderSettings, id string) bool {
	for _, provider := range providers {
		if provider.ID == id {
			return true
		}
	}
	return false
}

func snippet(body []byte) string {
	text := strings.TrimSpace(string(body))
	if len(text) > 300 {
		text = text[:300] + "…"
	}
	return text
}
