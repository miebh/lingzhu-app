package main

// ProviderPreset is a built-in starting point for a mainstream provider. The
// endpoint, environment variable and model list are editable after adding;
// presets only remove the manual setup step.
type ProviderPreset struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"baseUrl"`
	APIKeyEnv string `json:"apiKeyEnv"`
	// DefaultAPIKey prefills a key the endpoint accepts as-is, such as a
	// local gateway's app id. It stays editable and never leaves the host.
	DefaultAPIKey string `json:"defaultApiKey,omitempty"`
	// DynamicModels marks a preset whose catalog changes per machine, so the
	// client fetches it from the endpoint instead of shipping a stale list.
	DynamicModels bool          `json:"dynamicModels,omitempty"`
	Models        []PresetModel `json:"models"`
}

// PresetModel is one model prefilled by a provider preset or discovered
// through an endpoint's model list.
type PresetModel struct {
	ID              string                   `json:"id"`
	Name            string                   `json:"name"`
	ContextWindow   int                      `json:"contextWindow"`
	MaxOutputTokens int                      `json:"maxOutputTokens,omitempty"`
	ToolCall        *bool                    `json:"toolCall,omitempty"`
	Reasoning       bool                     `json:"reasoning,omitempty"`
	Attachment      bool                     `json:"attachment,omitempty"`
	Cost            *ModelCostSettings       `json:"cost,omitempty"`
	Modalities      *ModelModalitiesSettings `json:"modalities,omitempty"`
}

// providerPresets lists the built-in presets. Model ids are stable aliases
// where possible; every field stays editable because catalogs change.
func providerPresets() []ProviderPreset {
	return []ProviderPreset{
		{
			ID:        "openai",
			Name:      "OpenAI",
			BaseURL:   "https://api.openai.com/v1",
			APIKeyEnv: "OPENAI_API_KEY",
			Models: []PresetModel{
				{ID: "gpt-4.1", Name: "GPT-4.1", ContextWindow: 1_000_000},
				{ID: "gpt-4.1-mini", Name: "GPT-4.1 mini", ContextWindow: 1_000_000},
				{ID: "o4-mini", Name: "o4-mini", ContextWindow: 200_000},
			},
		},
		{
			ID:        "deepseek",
			Name:      "DeepSeek",
			BaseURL:   "https://api.deepseek.com/v1",
			APIKeyEnv: "DEEPSEEK_API_KEY",
			Models: []PresetModel{
				{ID: "deepseek-chat", Name: "DeepSeek Chat", ContextWindow: 128_000},
				{ID: "deepseek-reasoner", Name: "DeepSeek Reasoner", ContextWindow: 128_000},
			},
		},
		{
			ID:        "openrouter",
			Name:      "OpenRouter",
			BaseURL:   "https://openrouter.ai/api/v1",
			APIKeyEnv: "OPENROUTER_API_KEY",
			Models: []PresetModel{
				{ID: "openai/gpt-4.1", Name: "GPT-4.1", ContextWindow: 1_000_000},
				{ID: "anthropic/claude-sonnet-4.5", Name: "Claude Sonnet 4.5", ContextWindow: 200_000},
				{ID: "google/gemini-2.5-pro", Name: "Gemini 2.5 Pro", ContextWindow: 1_000_000},
				{ID: "deepseek/deepseek-chat", Name: "DeepSeek Chat", ContextWindow: 128_000},
			},
		},
		{
			ID:        "groq",
			Name:      "Groq",
			BaseURL:   "https://api.groq.com/openai/v1",
			APIKeyEnv: "GROQ_API_KEY",
			Models: []PresetModel{
				{ID: "openai/gpt-oss-120b", Name: "GPT OSS 120B", ContextWindow: 131_072},
				{ID: "llama-3.3-70b-versatile", Name: "Llama 3.3 70B", ContextWindow: 128_000},
				{ID: "qwen/qwen3-32b", Name: "Qwen3 32B", ContextWindow: 131_072},
			},
		},
		{
			ID:        "mistral",
			Name:      "Mistral",
			BaseURL:   "https://api.mistral.ai/v1",
			APIKeyEnv: "MISTRAL_API_KEY",
			Models: []PresetModel{
				{ID: "mistral-large-latest", Name: "Mistral Large", ContextWindow: 128_000},
				{ID: "codestral-latest", Name: "Codestral", ContextWindow: 256_000},
			},
		},
		{
			ID:        "xai",
			Name:      "xAI",
			BaseURL:   "https://api.x.ai/v1",
			APIKeyEnv: "XAI_API_KEY",
			Models: []PresetModel{
				{ID: "grok-4", Name: "Grok 4", ContextWindow: 256_000},
				{ID: "grok-3-mini", Name: "Grok 3 mini", ContextWindow: 131_072},
			},
		},
		{
			ID:        "moonshot",
			Name:      "Moonshot (Kimi)",
			BaseURL:   "https://api.moonshot.cn/v1",
			APIKeyEnv: "MOONSHOT_API_KEY",
			Models: []PresetModel{
				{ID: "moonshot-v1-8k", Name: "Moonshot v1 8K", ContextWindow: 8_192},
				{ID: "moonshot-v1-32k", Name: "Moonshot v1 32K", ContextWindow: 32_768},
				{ID: "moonshot-v1-128k", Name: "Moonshot v1 128K", ContextWindow: 128_000},
			},
		},
		{
			ID:        "zhipu",
			Name:      "Zhipu (GLM)",
			BaseURL:   "https://open.bigmodel.cn/api/paas/v4",
			APIKeyEnv: "ZHIPUAI_API_KEY",
			Models: []PresetModel{
				{ID: "glm-4.6", Name: "GLM-4.6", ContextWindow: 200_000},
				{ID: "glm-4.5-air", Name: "GLM-4.5 Air", ContextWindow: 128_000},
			},
		},
		{
			ID:        "qwen",
			Name:      "Qwen (DashScope)",
			BaseURL:   "https://dashscope.aliyuncs.com/compatible-mode/v1",
			APIKeyEnv: "DASHSCOPE_API_KEY",
			Models: []PresetModel{
				{ID: "qwen-max", Name: "Qwen Max", ContextWindow: 32_768},
				{ID: "qwen-plus", Name: "Qwen Plus", ContextWindow: 128_000},
				{ID: "qwen3-coder-plus", Name: "Qwen3 Coder Plus", ContextWindow: 1_000_000},
			},
		},
		{
			ID:        "siliconflow",
			Name:      "SiliconFlow",
			BaseURL:   "https://api.siliconflow.cn/v1",
			APIKeyEnv: "SILICONFLOW_API_KEY",
			Models: []PresetModel{
				{ID: "deepseek-ai/DeepSeek-V3", Name: "DeepSeek V3", ContextWindow: 128_000},
				{ID: "Qwen/Qwen3-32B", Name: "Qwen3 32B", ContextWindow: 128_000},
			},
		},
		{
			ID:            "magpie",
			Name:          "Magpie",
			BaseURL:       magpieGatewayURL() + "/v1",
			APIKeyEnv:     "MAGPIE_API_KEY",
			DefaultAPIKey: "magpie-" + magpieAppID,
			DynamicModels: true,
			// Keep the list non-nil so JSON encodes [] rather than null.
			Models: []PresetModel{},
		},
	}
}
