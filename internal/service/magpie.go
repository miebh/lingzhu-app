package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
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

// normalizeModelLabel repairs the GBK misreading of the "·" separator that
// some catalogs and pasted configs carry. The separator is UTF-8 C2 B7; the
// same bytes decoded as GBK become "路". Only the spaced separator is fixed so
// a legitimate Chinese name that happens to contain "路" stays intact.
func normalizeModelLabel(name string) string {
	name = strings.ReplaceAll(name, " 路 ", " · ")
	name = strings.ReplaceAll(name, " Â· ", " · ")
	return name
}

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
			ID              string   `json:"id"`
			Name            string   `json:"name"`
			DisplayName     string   `json:"display_name"`
			MagpieLabel     string   `json:"magpie_label"`
			ContextWindow   float64  `json:"context_window"`
			MaxOutputTokens float64  `json:"max_output_tokens"`
			ToolCall        *bool    `json:"tool_call"`
			Reasoning       bool     `json:"reasoning"`
			ReasoningLevels []string `json:"reasoning_levels"`
			// SupportedReasoningLevels is the richer gateway form; effort is
			// the only control its models currently advertise.
			SupportedReasoningLevels []struct {
				Effort string `json:"effort"`
			} `json:"supported_reasoning_levels"`
			Cost       *ModelCostSettings       `json:"cost"`
			Modalities *ModelModalitiesSettings `json:"modalities"`
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
		name = normalizeModelLabel(name)
		attachment := false
		if item.Modalities != nil {
			for _, kind := range item.Modalities.Input {
				if kind == "image" {
					attachment = true
				}
			}
		}
		levels := make([]string, 0, len(item.SupportedReasoningLevels))
		for _, level := range item.SupportedReasoningLevels {
			levels = append(levels, level.Effort)
		}
		if len(levels) == 0 {
			levels = item.ReasoningLevels
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
			Variants:        reasoningVariants(levels, false),
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

// magpieCatalog reads a gateway's catalog. A forced read bypasses the
// short-lived cache, so a model magpie just added or withdrew is visible on the
// next explicit refresh instead of after the cache expires.
func magpieCatalog(baseURL, key string, force bool) []PresetModel {
	cacheKey := baseURL + "\x00" + key
	if !force {
		magpieCatalogCache.Lock()
		if magpieCatalogCache.key == cacheKey && time.Since(magpieCatalogCache.at) < 30*time.Second {
			models := magpieCatalogCache.models
			magpieCatalogCache.Unlock()
			return models
		}
		magpieCatalogCache.Unlock()
	}

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
// gateway that is down leaves the stored projection untouched. A forced read
// bypasses the short-lived gateway cache.
func enrichMagpieModels(settings *AppSettings, file document, force bool) {
	enrichProviderModels(settings, file, magpieGatewayURL()+"/v1", force)
}

func enrichProviderModels(settings *AppSettings, file document, gateway string, force bool) {
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
		models := magpieCatalog(provider.BaseURL, key, force)
		if len(models) == 0 {
			continue
		}
		provider.Models = reconcileGatewayModels(provider.Models, gatewayModelIDs(file, provider.ID), models)
	}
}

// gatewayModelsKey records the model ids the gateway last advertised. A model
// that was in this list and is no longer advertised has been withdrawn, so it
// is dropped; a model the user added by hand was never in it and is kept.
const gatewayModelsKey = "gateway_models"

// gatewayModelIDs reads the ids a previous sync recorded for one provider.
func gatewayModelIDs(file document, providerID string) []string {
	entry, ok := asDocument(file.object("providers")[providerID])
	if !ok {
		return nil
	}
	return entry.strings(gatewayModelsKey)
}

// isGatewayURL reports whether a base URL points at the local gateway, whose
// catalog changes per machine and must be fetched instead of stored.
func isGatewayURL(baseURL string) bool {
	return strings.TrimRight(strings.TrimSpace(baseURL), "/") ==
		strings.TrimRight(magpieGatewayURL()+"/v1", "/")
}

// reconcileGatewayModels returns the model list a gateway provider should show,
// with the gateway as the source of truth for which models exist.
//
// A gateway model keeps the settings the user chose for it, such as a disabled
// switch or custom options, and picks up the gateway's metadata. A model the
// gateway dropped is removed, unless the user added it by hand.
//
// Which models came from the gateway is recorded in gateway_models. A config
// written before that record existed has no such list, so a model it no longer
// advertises is judged by its name: the gateway labels every model it serves as
// "Name · Provider", and a hand-added entry rarely carries that separator.
func reconcileGatewayModels(current []ModelSettings, synced []string, models []PresetModel) []ModelSettings {
	if len(models) == 0 {
		return current
	}
	recorded := make(map[string]bool, len(synced))
	for _, id := range synced {
		recorded[id] = true
	}
	existing := make(map[string]ModelSettings, len(current))
	for _, item := range current {
		existing[item.ID] = item
	}
	available := make(map[string]bool, len(models))
	out := make([]ModelSettings, 0, len(models)+len(current))
	for _, model := range models {
		available[model.ID] = true
		if item, ok := existing[model.ID]; ok {
			out = append(out, refreshGatewayModel(item, model))
			continue
		}
		out = append(out, ModelSettings{
			ID:              model.ID,
			Name:            model.Name,
			ContextWindow:   model.ContextWindow,
			MaxOutputTokens: model.MaxOutputTokens,
			ToolCall:        model.ToolCall,
			Reasoning:       model.Reasoning,
			Attachment:      model.Attachment,
			Cost:            model.Cost,
			Modalities:      model.Modalities,
			Variants:        model.Variants,
		})
	}
	// A model the gateway no longer lists stays only when the user added it.
	// Two signals mark a stored model as gateway-provided: a previous sync
	// recorded its id, or its name still carries the gateway's label. Either
	// one means the gateway withdrew it, so it is dropped; a plain name is a
	// model the user typed and is kept.
	for _, item := range current {
		if available[item.ID] {
			continue
		}
		if recorded[item.ID] || looksGatewayLabeled(item.Name) {
			continue
		}
		out = append(out, item)
	}
	return out
}

// looksGatewayLabeled reports whether a stored name carries the separator the
// gateway puts between a model and the provider it came from.
func looksGatewayLabeled(name string) bool {
	return strings.Contains(normalizeModelLabel(name), " · ")
}

// refreshGatewayModel keeps the user's choices on one model and takes the
// gateway's current metadata for it.
func refreshGatewayModel(item ModelSettings, model PresetModel) ModelSettings {
	// Follow the gateway's label while the stored name is still its plain
	// form; a name the user typed stays.
	plain := model.Name
	if at := strings.Index(plain, " · "); at >= 0 {
		plain = plain[:at]
	}
	stored := strings.TrimSpace(item.Name)
	if stored == "" || stored == strings.TrimSpace(plain) {
		item.Name = model.Name
	}
	if model.ContextWindow > 0 {
		item.ContextWindow = model.ContextWindow
	}
	if model.MaxOutputTokens > 0 {
		item.MaxOutputTokens = model.MaxOutputTokens
	}
	if model.ToolCall != nil {
		item.ToolCall = model.ToolCall
	}
	if model.Reasoning {
		item.Reasoning = true
	}
	if model.Attachment {
		item.Attachment = true
	}
	if model.Cost != nil {
		item.Cost = model.Cost
	}
	if model.Modalities != nil {
		item.Modalities = model.Modalities
	}
	if len(item.Variants) == 0 && len(model.Variants) > 0 {
		item.Variants = model.Variants
	}
	return item
}

// syncGatewayModels reconciles every provider that points at the local gateway
// with the models the gateway advertises, and repairs a default selection that
// names a withdrawn model. It reports whether the file changed.
//
// The write is what makes a new gateway model reachable: reading the settings
// only projects the reconciliation, so the core keeps its old catalog until the
// file changes and the cores restart.
func syncGatewayModels(file document, force bool) bool {
	return syncGatewayProvider(file, magpieGatewayURL()+"/v1", force)
}

// syncGatewayProvider reconciles gateway-backed providers against one gateway
// URL. It is the testable form of syncGatewayModels. A forced read bypasses the
// short-lived gateway cache.
func syncGatewayProvider(file document, gateway string, force bool) bool {
	gateway = strings.TrimRight(gateway, "/")
	providers := file.object("providers")
	if len(providers) == 0 {
		return false
	}
	ids := make([]string, 0, len(providers))
	for id := range providers {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	changed := false
	for _, id := range ids {
		entry, ok := asDocument(providers[id])
		if !ok {
			continue
		}
		if strings.TrimRight(entry.str("base_url"), "/") != gateway {
			continue
		}
		key := savedProviderKey(file, id)
		if key == "" {
			key = "magpie-" + magpieAppID
		}
		models := magpieCatalog(entry.str("base_url"), key, force)
		if len(models) == 0 {
			continue
		}
		current := make([]ModelSettings, 0)
		for _, item := range entry.objects("models") {
			modelID := strings.TrimSpace(item.str("id"))
			if modelID == "" {
				continue
			}
			name := item.str("name")
			if name == "" {
				name = modelID
			}
			window, _ := item.numeric("context_window")
			maxOutput, _ := item.numeric("max_output_tokens")
			current = append(current, ModelSettings{
				ID:              modelID,
				Name:            normalizeModelLabel(name),
				ContextWindow:   window,
				MaxOutputTokens: maxOutput,
				ToolCall:        item.boolPtr("tool_call"),
				Reasoning:       item.boolean("reasoning"),
				Attachment:      item.boolean("attachment"),
				Cost:            costSetting(item["cost"]),
				Modalities:      modalitiesSetting(item["modalities"]),
				Options:         mapValue(item, "options"),
				Variants:        variantsSetting(item),
			})
		}
		reconciled := reconcileGatewayModels(current, entry.strings(gatewayModelsKey), models)
		if !sameModels(entry["models"], reconciled) {
			entry["models"] = modelDocuments(reconciled)
			changed = true
		}
		advertised := make([]string, 0, len(models))
		for _, model := range models {
			advertised = append(advertised, model.ID)
		}
		if !sameStrings(entry.strings(gatewayModelsKey), advertised) {
			entry.setStrings(gatewayModelsKey, advertised)
			changed = true
		}
		providers[id] = entry
	}
	if !changed {
		return false
	}
	file["providers"] = providers
	repairSelection(file)
	return true
}

// repairSelection points the default selection at a model that still exists,
// so a config whose default was withdrawn keeps starting a usable turn.
func repairSelection(file document) {
	entry, ok := asDocument(file.object("providers")[file.str("provider")])
	if !ok {
		return
	}
	modelID := strings.TrimSpace(file.str("model"))
	items := entry.objects("models")
	for _, item := range items {
		if strings.TrimSpace(item.str("id")) == modelID {
			return
		}
	}
	for _, item := range items {
		if id := strings.TrimSpace(item.str("id")); id != "" {
			file["model"] = id
			return
		}
	}
}

// sameModels reports whether a stored model list already matches the
// reconciled one, comparing the fields a write would change.
func sameModels(stored any, models []ModelSettings) bool {
	raw, ok := stored.([]any)
	if !ok || len(raw) != len(models) {
		return false
	}
	for index, item := range raw {
		entry, ok := asDocument(item)
		if !ok {
			return false
		}
		model := models[index]
		if strings.TrimSpace(entry.str("id")) != strings.TrimSpace(model.ID) {
			return false
		}
		if normalizeModelLabel(entry.str("name")) != normalizeModelLabel(model.Name) {
			return false
		}
		if window, ok := entry.numeric("context_window"); !ok || window != model.ContextWindow {
			return false
		}
		if output, ok := entry.numeric("max_output_tokens"); ok != (model.MaxOutputTokens > 0) ||
			(ok && output != model.MaxOutputTokens) {
			return false
		}
	}
	return true
}

func sameStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

// modelDocuments renders models the way the config file stores them.
func modelDocuments(models []ModelSettings) []any {
	out := make([]any, 0, len(models))
	for _, item := range models {
		modelID := strings.TrimSpace(item.ID)
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = modelID
		}
		model := document{
			"id":             modelID,
			"name":           normalizeModelLabel(name),
			"context_window": item.ContextWindow,
		}
		if item.MaxOutputTokens > 0 {
			model["max_output_tokens"] = item.MaxOutputTokens
		}
		if item.ToolCall != nil {
			model["tool_call"] = *item.ToolCall
		}
		if item.Reasoning {
			model["reasoning"] = true
		}
		if item.Attachment {
			model["attachment"] = true
		}
		if item.Cost != nil {
			model["cost"] = item.Cost
		}
		if item.Modalities != nil {
			model["modalities"] = item.Modalities
		}
		if len(item.Options) > 0 {
			model["options"] = item.Options
		}
		if len(item.Variants) > 0 {
			model["variants"] = item.Variants
		}
		out = append(out, model)
	}
	return out
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
