package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"lingzhu-app/internal/global"
)

const (
	// modelsDevURL is the public catalog, limited to chat models. v2 carries
	// each model's chat-completions base URL, which the v1 API does not.
	modelsDevURL = "https://models.dev/experimental/v2.0/api.json?type=chat"
	// catalogTTL keeps startup off the network most of the time.
	catalogTTL = 24 * time.Hour
	// catalogMaxBytes bounds a malformed or huge response.
	catalogMaxBytes = 32 << 20
	// catalogCacheVersion invalidates caches written before the model shape
	// gained reasoning variants.
	catalogCacheVersion = 2
)

// catalogAliases map built-in preset ids to the catalog's spelling.
var catalogAliases = map[string]string{
	"moonshot": "moonshotai",
	"zhipu":    "zhipuai",
	"qwen":     "alibaba",
}

var (
	catalogFetchMu sync.Mutex
	catalogCache   struct {
		sync.Mutex
		loaded  bool
		at      time.Time
		presets []ProviderPreset
		source  string
	}
)

// ProviderPresets merges the built-in presets with the cached public catalog.
// The catalog is read from disk only; a background fetch fills it.
func (s *CoreService) ProviderPresets() []ProviderPreset {
	return mergedPresets()
}

func mergedPresets() []ProviderPreset {
	builtins := providerPresets()
	catalog := cachedCatalogPresets()
	if len(catalog) == 0 {
		return builtins
	}
	byID := make(map[string]ProviderPreset, len(catalog))
	for _, preset := range catalog {
		byID[preset.ID] = preset
	}
	used := map[string]bool{}
	out := make([]ProviderPreset, 0, len(builtins)+len(catalog))
	for _, preset := range builtins {
		key := preset.ID
		if alias, ok := catalogAliases[key]; ok {
			key = alias
		}
		if fromCatalog, ok := byID[key]; ok {
			preset = mergePreset(preset, fromCatalog)
			used[key] = true
		}
		out = append(out, preset)
	}
	extra := make([]ProviderPreset, 0, len(catalog))
	for _, preset := range catalog {
		if !used[preset.ID] {
			extra = append(extra, preset)
		}
	}
	sort.Slice(extra, func(i, j int) bool { return extra[i].Name < extra[j].Name })
	return append(out, extra...)
}

// mergePreset keeps the built-in endpoint and key variable, then fills model
// metadata and appends catalog models the preset does not list.
func mergePreset(base, catalog ProviderPreset) ProviderPreset {
	known := make(map[string]PresetModel, len(catalog.Models))
	for _, model := range catalog.Models {
		known[model.ID] = model
	}
	seen := map[string]bool{}
	models := make([]PresetModel, 0, len(base.Models)+len(catalog.Models))
	for _, model := range base.Models {
		if fromCatalog, ok := known[model.ID]; ok {
			model = fillPresetMetadata(model, fromCatalog)
		}
		seen[model.ID] = true
		models = append(models, model)
	}
	for _, model := range catalog.Models {
		if !seen[model.ID] {
			models = append(models, model)
		}
	}
	base.Models = models
	return base
}

func fillPresetMetadata(model, source PresetModel) PresetModel {
	if model.Name == "" || model.Name == model.ID {
		model.Name = source.Name
	}
	if model.ContextWindow == 0 {
		model.ContextWindow = source.ContextWindow
	}
	if model.MaxOutputTokens == 0 {
		model.MaxOutputTokens = source.MaxOutputTokens
	}
	if model.ToolCall == nil {
		model.ToolCall = source.ToolCall
	}
	if !model.Reasoning {
		model.Reasoning = source.Reasoning
	}
	if !model.Attachment {
		model.Attachment = source.Attachment
	}
	if model.Cost == nil {
		model.Cost = source.Cost
	}
	if model.Modalities == nil {
		model.Modalities = source.Modalities
	}
	if len(model.Variants) == 0 {
		model.Variants = source.Variants
	}
	return model
}

// enrichCatalogModels fills metadata on providers that came from the public
// catalog. Existing values win, so a user's edits are never overwritten.
//
// It only reads a catalog that is already in memory: this runs on the settings
// binding, which the window calls while it paints, and parsing the multi-megabyte
// cache there would be paid by every first read. The background fetch fills the
// cache; a call that arrives before it finishes simply returns the stored values.
func enrichCatalogModels(settings *AppSettings) {
	catalog := loadedCatalogPresets()
	if len(catalog) == 0 {
		return
	}
	byID := make(map[string]ProviderPreset, len(catalog))
	byURL := make(map[string]ProviderPreset, len(catalog))
	for _, preset := range catalog {
		byID[preset.ID] = preset
		byURL[strings.TrimRight(preset.BaseURL, "/")] = preset
	}
	for i := range settings.Providers {
		provider := &settings.Providers[i]
		preset, ok := byID[provider.ID]
		if !ok {
			preset, ok = byURL[strings.TrimRight(provider.BaseURL, "/")]
		}
		if !ok {
			continue
		}
		models := make(map[string]PresetModel, len(preset.Models))
		for _, model := range preset.Models {
			models[model.ID] = model
		}
		for j := range provider.Models {
			source, ok := models[provider.Models[j].ID]
			if !ok {
				continue
			}
			model := &provider.Models[j]
			if model.ContextWindow == 0 {
				model.ContextWindow = source.ContextWindow
			}
			if model.MaxOutputTokens == 0 {
				model.MaxOutputTokens = source.MaxOutputTokens
			}
			if model.ToolCall == nil {
				model.ToolCall = source.ToolCall
			}
			if !model.Reasoning {
				model.Reasoning = source.Reasoning
			}
			if !model.Attachment {
				model.Attachment = source.Attachment
			}
			if model.Cost == nil {
				model.Cost = source.Cost
			}
			if model.Modalities == nil {
				model.Modalities = source.Modalities
			}
			if len(model.Variants) == 0 && len(source.Variants) > 0 {
				model.Variants = source.Variants
			}
		}
	}
}

// ServiceStartup prefetches the catalog in the background. A failure leaves
// the built-in presets and any previous cache in place.
func (s *CoreService) startCatalogFetch() {
	go func() {
		_ = refreshCatalog(false)
	}()
}

func cachedCatalogPresets() []ProviderPreset {
	catalogCache.Lock()
	defer catalogCache.Unlock()
	if catalogCache.loaded {
		return catalogCache.presets
	}
	catalogCache.loaded = true
	file, err := readCatalogCache()
	if err != nil || file.Version != catalogCacheVersion {
		return nil
	}
	catalogCache.presets = file.Presets
	catalogCache.at = file.FetchedAt
	return catalogCache.presets
}

// loadedCatalogPresets returns the catalog only when it is already in memory.
// It never reads the cache file, so it stays cheap enough for the first
// settings read of a cold start; the background fetch warms the cache instead.
func loadedCatalogPresets() []ProviderPreset {
	catalogCache.Lock()
	defer catalogCache.Unlock()
	return catalogCache.presets
}

type catalogCacheFile struct {
	Version   int              `json:"version"`
	FetchedAt time.Time        `json:"fetchedAt"`
	Source    string           `json:"source"`
	Presets   []ProviderPreset `json:"presets"`
}

func readCatalogCache() (catalogCacheFile, error) {
	data, err := os.ReadFile(catalogCachePath())
	if err != nil {
		return catalogCacheFile{}, err
	}
	var file catalogCacheFile
	if err := json.Unmarshal(data, &file); err != nil {
		return catalogCacheFile{}, err
	}
	return file, nil
}

func catalogCachePath() string {
	return filepath.Join(global.Cache(), "models.dev.presets.json")
}

// refreshCatalog fetches and stores the catalog. A non-forced call skips the
// network while the cache is still fresh.
func refreshCatalog(force bool) error {
	catalogFetchMu.Lock()
	defer catalogFetchMu.Unlock()

	catalogCache.Lock()
	if !force && catalogCache.loaded && time.Since(catalogCache.at) < catalogTTL && len(catalogCache.presets) > 0 {
		catalogCache.Unlock()
		return nil
	}
	catalogCache.Unlock()

	if !force {
		if file, err := readCatalogCache(); err == nil && file.Version == catalogCacheVersion &&
			time.Since(file.FetchedAt) < catalogTTL && len(file.Presets) > 0 {
			catalogCache.Lock()
			catalogCache.loaded, catalogCache.at, catalogCache.presets, catalogCache.source = true, file.FetchedAt, file.Presets, file.Source
			catalogCache.Unlock()
			return nil
		}
	}

	source := catalogSource()
	data, err := readCatalogSource(source)
	if err != nil {
		return err
	}
	presets, err := parseCatalog(data)
	if err != nil {
		return err
	}
	file := catalogCacheFile{Version: catalogCacheVersion, FetchedAt: time.Now(), Source: source, Presets: presets}
	if err := writeCatalogCache(file); err != nil {
		return err
	}
	catalogCache.Lock()
	catalogCache.loaded, catalogCache.at, catalogCache.presets, catalogCache.source = true, file.FetchedAt, presets, source
	catalogCache.Unlock()
	return nil
}

func catalogSource() string {
	if source := strings.TrimSpace(os.Getenv("LINGZHU_MODELS_URL")); source != "" {
		return source
	}
	return modelsDevURL
}

func readCatalogSource(source string) ([]byte, error) {
	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		client := &http.Client{Timeout: 45 * time.Second}
		resp, err := client.Get(source)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("catalog: %s", resp.Status)
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, catalogMaxBytes))
		if err != nil {
			return nil, err
		}
		return data, nil
	}
	return os.ReadFile(source)
}

func writeCatalogCache(file catalogCacheFile) error {
	data, err := json.Marshal(file)
	if err != nil {
		return err
	}
	path := catalogCachePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// modelsDevCatalog is the v2 shape: providers keyed by id.
type modelsDevCatalog map[string]modelsDevProvider

type modelsDevProvider struct {
	ID     string                    `json:"id"`
	Name   string                    `json:"name"`
	Env    []string                  `json:"env"`
	Models map[string]modelsDevModel `json:"models"`
}

type modelsDevModel struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Name       string `json:"name"`
	Modalities *struct {
		Input  []string `json:"input"`
		Output []string `json:"output"`
	} `json:"modalities"`
	Capabilities *struct {
		Tools *struct {
			Supported bool `json:"supported"`
		} `json:"tools"`
		Reasoning *struct {
			Supported bool     `json:"supported"`
			Toggle    bool     `json:"toggle"`
			Effort    []string `json:"effort"`
		} `json:"reasoning"`
	} `json:"capabilities"`
	Limit *struct {
		Context int `json:"context"`
		Output  int `json:"output"`
	} `json:"limit"`
	Cost *struct {
		Text *struct {
			Input *struct {
				Price float64 `json:"price"`
				Cache *struct {
					Read  any `json:"read"`
					Write any `json:"write"`
				} `json:"cache"`
			} `json:"input"`
			Output *struct {
				Price float64 `json:"price"`
			} `json:"output"`
		} `json:"text"`
	} `json:"cost"`
	API map[string]*struct {
		BaseURL string `json:"base_url"`
	} `json:"api"`
}

func parseCatalog(data []byte) ([]ProviderPreset, error) {
	var catalog modelsDevCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		return nil, fmt.Errorf("catalog: %w", err)
	}
	if len(catalog) == 0 {
		return nil, errors.New("catalog: no providers")
	}
	presets := make([]ProviderPreset, 0, len(catalog))
	for _, provider := range catalog {
		if preset, ok := catalogPreset(provider); ok {
			presets = append(presets, preset)
		}
	}
	sort.Slice(presets, func(i, j int) bool {
		if presets[i].Name == presets[j].Name {
			return presets[i].ID < presets[j].ID
		}
		return presets[i].Name < presets[j].Name
	})
	return presets, nil
}

func catalogPreset(provider modelsDevProvider) (ProviderPreset, bool) {
	bases := map[string]int{}
	for key, model := range provider.Models {
		if model.ID == "" {
			model.ID = key
		}
		if model.Type != "" && model.Type != "chat" {
			continue
		}
		if base := chatBaseURL(model); base != "" {
			bases[base]++
		}
	}
	if len(bases) == 0 {
		return ProviderPreset{}, false
	}
	base := ""
	best := 0
	for candidate, count := range bases {
		if count > best || (count == best && (base == "" || candidate < base)) {
			base, best = candidate, count
		}
	}
	models := make([]PresetModel, 0, len(provider.Models))
	seen := map[string]bool{}
	for key, model := range provider.Models {
		if model.ID == "" {
			model.ID = key
		}
		if model.Type != "" && model.Type != "chat" {
			continue
		}
		if chatBaseURL(model) != base || seen[model.ID] {
			continue
		}
		seen[model.ID] = true
		models = append(models, catalogModel(model))
	}
	if len(models) == 0 {
		return ProviderPreset{}, false
	}
	sort.Slice(models, func(i, j int) bool {
		if models[i].Name == models[j].Name {
			return models[i].ID < models[j].ID
		}
		return models[i].Name < models[j].Name
	})
	env := ""
	for _, name := range provider.Env {
		if name = strings.TrimSpace(name); name != "" {
			env = name
			break
		}
	}
	defaultKey := ""
	if env == "" {
		if !localBaseURL(base) {
			// A remote provider with no key variable needs a sign-in this
			// client does not have.
			return ProviderPreset{}, false
		}
		defaultKey = "local"
	}
	name := strings.TrimSpace(provider.Name)
	if name == "" {
		name = provider.ID
	}
	return ProviderPreset{
		ID:            provider.ID,
		Name:          name,
		BaseURL:       base,
		APIKeyEnv:     env,
		DefaultAPIKey: defaultKey,
		Models:        models,
	}, true
}

func chatBaseURL(model modelsDevModel) string {
	api, ok := model.API["chat-completions"]
	if !ok || api == nil {
		return ""
	}
	return strings.TrimRight(strings.TrimSpace(api.BaseURL), "/")
}

func localBaseURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func catalogModel(model modelsDevModel) PresetModel {
	out := PresetModel{
		ID:   model.ID,
		Name: model.Name,
	}
	if out.Name == "" {
		out.Name = model.ID
	}
	if model.Limit != nil {
		out.ContextWindow = model.Limit.Context
		out.MaxOutputTokens = model.Limit.Output
	}
	if model.Capabilities != nil {
		if model.Capabilities.Tools != nil {
			supported := model.Capabilities.Tools.Supported
			out.ToolCall = &supported
		}
		if model.Capabilities.Reasoning != nil {
			out.Reasoning = model.Capabilities.Reasoning.Supported
			if out.Reasoning {
				out.Variants = reasoningVariants(model.Capabilities.Reasoning.Effort, model.Capabilities.Reasoning.Toggle)
			}
		}
	}
	if model.Modalities != nil {
		out.Modalities = &ModelModalitiesSettings{Input: model.Modalities.Input, Output: model.Modalities.Output}
		for _, kind := range model.Modalities.Input {
			if strings.HasPrefix(kind, "image") {
				out.Attachment = true
			}
		}
	}
	if model.Cost != nil && model.Cost.Text != nil {
		cost := &ModelCostSettings{}
		if input := model.Cost.Text.Input; input != nil {
			cost.Input = input.Price
			if input.Cache != nil {
				cost.CacheRead = priceValue(input.Cache.Read)
				cost.CacheWrite = priceValue(input.Cache.Write)
			}
		}
		if output := model.Cost.Text.Output; output != nil {
			cost.Output = output.Price
		}
		if cost.Input != 0 || cost.Output != 0 || cost.CacheRead != 0 || cost.CacheWrite != 0 {
			out.Cost = cost
		}
	}
	return out
}

// priceValue reads a prices field that may be a number or a map keyed by a
// cache lifetime; the cheapest tier describes the model well enough.
func priceValue(value any) float64 {
	switch item := value.(type) {
	case float64:
		return item
	case map[string]any:
		best := 0.0
		for _, nested := range item {
			if price := priceValue(nested); price > 0 && (best == 0 || price < best) {
				best = price
			}
		}
		return best
	}
	return 0
}
