package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// magpieAppID is sent as the gateway key so magpie attributes this app's
	// calls to Lingzhu in Usage and routing rules.
	magpieAppID = "lingzhu"
	// magpieDefaultPort is the gateway's port when settings.json says nothing.
	magpieDefaultPort = 3425
)

// MagpieGateway is the local gateway magpie runs for coding agents.
type MagpieGateway struct {
	URL       string `json:"url"`
	Available bool   `json:"available"`
	Version   string `json:"version"`
}

// Magpie reports where magpie's gateway listens and whether it answers.
func (s *CoreService) Magpie() MagpieGateway {
	return detectMagpie()
}

// detectMagpie probes the documented hello route instead of trusting the
// settings file alone: a stale file must not make the dialog claim a gateway.
func detectMagpie() MagpieGateway {
	base := magpieGatewayURL()
	gateway := MagpieGateway{URL: base + "/v1"}
	client := &http.Client{Timeout: 600 * time.Millisecond}
	resp, err := client.Get(base + "/api/hello")
	if err != nil {
		return gateway
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return gateway
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	var hello struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	}
	if json.Unmarshal(body, &hello) != nil || hello.Name != "magpie" {
		return gateway
	}
	gateway.Available = true
	gateway.Version = hello.Version
	return gateway
}

// ProviderModels lists an endpoint's models through its OpenAI-compatible
// /models route. It uses the saved key when the form has none.
func (s *CoreService) ProviderModels(providerID, baseURL, apiKey, apiKeyEnv string) ([]PresetModel, error) {
	file, err := s.readConfigFile()
	if err != nil {
		return nil, err
	}
	id := strings.TrimSpace(providerID)
	providers, _, _ := readProviderSettings(file)
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
		return nil, err
	}
	key := strings.TrimSpace(apiKey)
	if key == "" && strings.TrimSpace(apiKeyEnv) != "" {
		key = os.Getenv(strings.TrimSpace(apiKeyEnv))
	}
	if key == "" {
		key = savedProviderKey(file, id)
	}
	return fetchProviderModels(base, key)
}

func fetchProviderModels(baseURL, key string) ([]PresetModel, error) {
	return fetchProviderModelsWithin(baseURL, key, 10*time.Second)
}

func fetchProviderModelsWithin(baseURL, key string, timeout time.Duration) ([]PresetModel, error) {
	client := &http.Client{Timeout: timeout}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(baseURL, "/")+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("API key was rejected")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s: %s", resp.Status, snippet(body))
	}
	var payload struct {
		Data []struct {
			ID              string                   `json:"id"`
			Name            string                   `json:"name"`
			DisplayName     string                   `json:"display_name"`
			MagpieLabel     string                   `json:"magpie_label"`
			ContextWindow   float64                  `json:"context_window"`
			MaxOutputTokens float64                  `json:"max_output_tokens"`
			ToolCall        *bool                    `json:"tool_call"`
			Reasoning       bool                     `json:"reasoning"`
			Cost            *ModelCostSettings       `json:"cost"`
			Modalities      *ModelModalitiesSettings `json:"modalities"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode models: %w", err)
	}
	models := make([]PresetModel, 0, len(payload.Data))
	seen := map[string]bool{}
	for _, item := range payload.Data {
		modelID := strings.TrimSpace(item.ID)
		if modelID == "" || seen[modelID] {
			continue
		}
		seen[modelID] = true
		// magpie_label keeps the upstream provider after the name, as its
		// own agent lists do, so two providers' models of one name stay
		// distinguishable in a single gateway provider.
		name := strings.TrimSpace(item.MagpieLabel)
		if name == "" {
			name = strings.TrimSpace(item.DisplayName)
		}
		if name == "" {
			name = strings.TrimSpace(item.Name)
		}
		if name == "" {
			name = modelID
		}
		attachment := false
		if item.Modalities != nil {
			for _, kind := range item.Modalities.Input {
				if kind == "image" {
					attachment = true
				}
			}
		}
		models = append(models, PresetModel{
			ID:              modelID,
			Name:            name,
			ContextWindow:   int(item.ContextWindow),
			MaxOutputTokens: int(item.MaxOutputTokens),
			ToolCall:        item.ToolCall,
			Reasoning:       item.Reasoning,
			Attachment:      attachment,
			Cost:            item.Cost,
			Modalities:      item.Modalities,
		})
	}
	return models, nil
}

// magpieCatalog caches a gateway's catalog briefly: settings reads refresh
// display names through it, and they must not turn the local gateway into a
// hot path while dialogs reopen.
var magpieCatalogCache struct {
	sync.Mutex
	key    string
	at     time.Time
	models []PresetModel
}

func magpieCatalog(baseURL, key string) []PresetModel {
	cacheKey := baseURL + "\x00" + key
	magpieCatalogCache.Lock()
	if magpieCatalogCache.key == cacheKey && time.Since(magpieCatalogCache.at) < 30*time.Second {
		models := magpieCatalogCache.models
		magpieCatalogCache.Unlock()
		return models
	}
	magpieCatalogCache.Unlock()

	models, err := fetchProviderModelsWithin(baseURL, key, 2*time.Second)
	if err != nil {
		models = nil
	}
	magpieCatalogCache.Lock()
	magpieCatalogCache.key = cacheKey
	magpieCatalogCache.at = time.Now()
	magpieCatalogCache.models = models
	magpieCatalogCache.Unlock()
	return models
}

// enrichMagpieModels refreshes the names and windows of every provider that
// points at the local gateway, so an existing config follows magpie's labels
// (provider names included) without being rewritten. Errors are ignored: a
// gateway that is down leaves the stored projection untouched.
func enrichMagpieModels(settings *AppSettings, file document) {
	enrichProviderModels(settings, file, magpieGatewayURL()+"/v1")
}

func enrichProviderModels(settings *AppSettings, file document, gateway string) {
	gateway = strings.TrimRight(gateway, "/")
	for i := range settings.Providers {
		provider := &settings.Providers[i]
		if strings.TrimRight(provider.BaseURL, "/") != gateway {
			continue
		}
		key := savedProviderKey(file, provider.ID)
		if key == "" {
			key = "magpie-" + magpieAppID
		}
		models := magpieCatalog(provider.BaseURL, key)
		if len(models) == 0 {
			continue
		}
		byID := make(map[string]PresetModel, len(models))
		for _, model := range models {
			byID[model.ID] = model
		}
		for j := range provider.Models {
			model, ok := byID[provider.Models[j].ID]
			if !ok {
				continue
			}
			// Follow the gateway's label while the stored name is still its
			// plain form; a name the user typed stays.
			plain := model.Name
			if at := strings.Index(plain, " · "); at >= 0 {
				plain = plain[:at]
			}
			stored := strings.TrimSpace(provider.Models[j].Name)
			if stored == "" || stored == strings.TrimSpace(plain) {
				provider.Models[j].Name = model.Name
			}
			if model.ContextWindow > 0 {
				provider.Models[j].ContextWindow = model.ContextWindow
			}
			if model.MaxOutputTokens > 0 {
				provider.Models[j].MaxOutputTokens = model.MaxOutputTokens
			}
			if model.ToolCall != nil {
				provider.Models[j].ToolCall = model.ToolCall
			}
			if model.Reasoning {
				provider.Models[j].Reasoning = true
			}
			if model.Attachment {
				provider.Models[j].Attachment = true
			}
			if model.Cost != nil {
				provider.Models[j].Cost = model.Cost
			}
			if model.Modalities != nil {
				provider.Models[j].Modalities = model.Modalities
			}
		}
	}
}

// magpieGatewayURL is the gateway root without /v1, as the hello route wants.
func magpieGatewayURL() string {
	return "http://127.0.0.1:" + strconv.Itoa(magpiePort())
}

func magpiePort() int {
	path := magpieSettingsPath()
	if path == "" {
		return magpieDefaultPort
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return magpieDefaultPort
	}
	var settings struct {
		Port any `json:"port"`
	}
	if json.Unmarshal(data, &settings) != nil {
		return magpieDefaultPort
	}
	switch value := settings.Port.(type) {
	case float64:
		if value > 0 && value < 65536 {
			return int(value)
		}
	case string:
		if port, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && port > 0 && port < 65536 {
			return port
		}
	}
	return magpieDefaultPort
}

// magpieSettingsPath follows magpie's documented location: XDG_CONFIG_HOME
// when set, otherwise ~/.config/magpie/settings.json on every system.
func magpieSettingsPath() string {
	if dir := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); dir != "" {
		return filepath.Join(dir, "magpie", "settings.json")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".config", "magpie", "settings.json")
}
