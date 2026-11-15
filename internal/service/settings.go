package service

import (
	"os"
	"sort"
	"strings"
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
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"baseUrl"`
	APIKeySet bool   `json:"apiKeySet"`
	APIKeyEnv string `json:"apiKeyEnv"`
	Ready     bool   `json:"ready"`
	// DynamicModels marks a provider whose model list comes from its endpoint,
	// such as the local gateway. A client refreshes it instead of trusting the
	// stored copy.
	DynamicModels bool            `json:"dynamicModels,omitempty"`
	Blacklist     []string        `json:"blacklist"`
	Whitelist     []string        `json:"whitelist"`
	Models        []ModelSettings `json:"models"`
}

// ModelSettings is one model in a provider.
type ModelSettings struct {
	ID              string                    `json:"id"`
	Name            string                    `json:"name"`
	ContextWindow   int                       `json:"contextWindow"`
	MaxOutputTokens int                       `json:"maxOutputTokens,omitempty"`
	Enabled         bool                      `json:"enabled"`
	ToolCall        *bool                     `json:"toolCall,omitempty"`
	Reasoning       bool                      `json:"reasoning"`
	Attachment      bool                      `json:"attachment"`
	Cost            *ModelCostSettings        `json:"cost,omitempty"`
	Modalities      *ModelModalitiesSettings  `json:"modalities,omitempty"`
	Options         map[string]any            `json:"options,omitempty"`
	Variants        map[string]map[string]any `json:"variants,omitempty"`
}

// ModelCostSettings is a model's price per million tokens.
type ModelCostSettings struct {
	Input      float64 `json:"input,omitempty"`
	Output     float64 `json:"output,omitempty"`
	CacheRead  float64 `json:"cache_read,omitempty"`
	CacheWrite float64 `json:"cache_write,omitempty"`
}

// ModelModalitiesSettings are the media kinds a model takes and returns.
type ModelModalitiesSettings struct {
	Input  []string `json:"input,omitempty"`
	Output []string `json:"output,omitempty"`
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
	Blacklist []string     `json:"blacklist"`
	Whitelist []string     `json:"whitelist"`
	Models    []ModelInput `json:"models"`
}

// ModelInput is one model being saved.
type ModelInput struct {
	ID              string                    `json:"id"`
	Name            string                    `json:"name"`
	ContextWindow   int                       `json:"contextWindow"`
	MaxOutputTokens int                       `json:"maxOutputTokens,omitempty"`
	Enabled         bool                      `json:"enabled"`
	ToolCall        *bool                     `json:"toolCall,omitempty"`
	Reasoning       bool                      `json:"reasoning"`
	Attachment      bool                      `json:"attachment"`
	Cost            *ModelCostSettings        `json:"cost,omitempty"`
	Modalities      *ModelModalitiesSettings  `json:"modalities,omitempty"`
	Options         map[string]any            `json:"options,omitempty"`
	Variants        map[string]map[string]any `json:"variants,omitempty"`
}

// ModelVisibility is one model's picker visibility. The core never reads this
// presentation flag, so changing it does not require a core restart.
type ModelVisibility struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Enabled  bool   `json:"enabled"`
}

func buildAppSettings(configPath string, file document) AppSettings {
	providers, provider, model := readProviderSettings(file)
	return AppSettings{
		ConfigPath:    configPath,
		Provider:      provider,
		Model:         model,
		Providers:     providers,
		MaxSteps:      file.int("max_steps", defaultMaxSteps),
		ContextWindow: file.count("context_window", defaultContextWindow),
		CompactKeep:   file.int("compact_keep", defaultCompactKeep),
		SystemPrompt:  file.str("system_prompt"),
		Shell:         file.strings("shell"),
		Permission:    permissionRules(file),
	}
}

func permissionRules(file document) []ConfigRule {
	out := make([]ConfigRule, 0)
	for _, entry := range file.objects("permission") {
		out = append(out, ConfigRule{
			Action:   entry.str("action"),
			Resource: entry.str("resource"),
			Effect:   entry.str("effect"),
		})
	}
	return out
}

// readProviderSettings projects the providers block. Configs without one are
// shown as a single legacy "default" provider so old files stay editable.
func readProviderSettings(file document) ([]ProviderSettings, string, string) {
	topModel := strings.TrimSpace(file.str("model"))
	fallbackWindow := file.count("context_window", defaultContextWindow)
	if _, exists := file["providers"]; !exists {
		return legacyProvider(file, topModel, fallbackWindow), "default", topModel
	}
	raw := file.object("providers")
	if len(raw) == 0 {
		return []ProviderSettings{}, "", ""
	}

	ids := make([]string, 0, len(raw))
	for id := range raw {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	providers := make([]ProviderSettings, 0, len(ids))
	for _, id := range ids {
		entry, ok := asDocument(raw[id])
		if !ok {
			continue
		}
		name := entry.str("name")
		if name == "" {
			name = id
		}
		baseURL := entry.str("base_url")
		env := entry.str("api_key_env")
		keySet := entry.str("api_key") != "" || (env != "" && os.Getenv(env) != "")
		models := make([]ModelSettings, 0)
		for _, model := range entry.objects("models") {
			modelID := strings.TrimSpace(model.str("id"))
			if modelID == "" {
				continue
			}
			modelName := model.str("name")
			if modelName == "" {
				modelName = modelID
			}
			modelName = normalizeModelLabel(modelName)
			enabled := true
			if value, ok := model["enabled"].(bool); ok {
				enabled = value
			}
			models = append(models, ModelSettings{
				ID:              modelID,
				Name:            modelName,
				ContextWindow:   model.count("context_window", fallbackWindow),
				MaxOutputTokens: model.int("max_output_tokens", 0),
				Enabled:         enabled,
				ToolCall:        model.boolPtr("tool_call"),
				Reasoning:       model.boolean("reasoning"),
				Attachment:      model.boolean("attachment"),
				Cost:            costSetting(model["cost"]),
				Modalities:      modalitiesSetting(model["modalities"]),
				Options:         mapValue(model, "options"),
				Variants:        variantsSetting(model),
			})
		}
		providers = append(providers, ProviderSettings{
			ID:            id,
			Name:          name,
			BaseURL:       baseURL,
			APIKeySet:     keySet,
			APIKeyEnv:     env,
			Ready:         baseURL != "" && keySet,
			DynamicModels: isGatewayURL(baseURL),
			Blacklist:     entry.strings("blacklist"),
			Whitelist:     entry.strings("whitelist"),
			Models:        models,
		})
	}
	if len(providers) == 0 {
		return legacyProvider(file, topModel, fallbackWindow), "default", topModel
	}

	selected := strings.TrimSpace(file.str("provider"))
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

func legacyProvider(file document, model string, fallbackWindow int) []ProviderSettings {
	baseURL := file.str("base_url")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	keySet := file.str("api_key") != "" || os.Getenv("OPENAI_API_KEY") != ""
	models := make([]ModelSettings, 0)
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
