package service

import (
	"errors"
	"fmt"
	"strings"
)

func validateSettingsInput(input SettingsInput) error {
	model := strings.TrimSpace(input.Model)
	if input.MaxSteps < 0 {
		return errors.New("max steps cannot be negative; 0 means no limit")
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
		// Disconnecting the last provider leaves no model configured; the
		// core still starts and a prompt reports that no provider is set.
		if model != "" || strings.TrimSpace(input.Provider) != "" {
			return errors.New("no providers configured")
		}
		return nil
	}
	if model == "" {
		return errors.New("model is required")
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

func applySettingsInput(file document, input SettingsInput) {
	model := strings.TrimSpace(input.Model)
	providerID := strings.TrimSpace(input.Provider)

	existing := file.object("providers")
	next := document{}
	for _, provider := range input.Providers {
		id := strings.TrimSpace(provider.ID)
		entry := document{}
		if old, ok := asDocument(existing[id]); ok {
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
			if legacy := file.str("api_key"); legacy != "" {
				entry["api_key"] = legacy
			}
		}
		entry.setStrings("blacklist", provider.Blacklist)
		entry.setStrings("whitelist", provider.Whitelist)
		// gateway_models is bookkeeping the sync writes; a manual save keeps it
		// so a later sync still knows which models came from the gateway.
		models := make([]any, 0, len(provider.Models))
		for _, item := range provider.Models {
			modelID := strings.TrimSpace(item.ID)
			name := strings.TrimSpace(item.Name)
			if name == "" {
				name = modelID
			}
			name = normalizeModelLabel(name)
			model := document{
				"id":             modelID,
				"name":           name,
				"context_window": item.ContextWindow,
				"enabled":        item.Enabled,
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
			models = append(models, model)
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
	file.setStrings("shell", input.Shell)
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
			Blacklist: provider.Blacklist,
			Whitelist: provider.Whitelist,
		}
		for _, model := range provider.Models {
			entry.Models = append(entry.Models, ModelInput{
				ID:              model.ID,
				Name:            model.Name,
				ContextWindow:   model.ContextWindow,
				MaxOutputTokens: model.MaxOutputTokens,
				Enabled:         model.Enabled,
				ToolCall:        model.ToolCall,
				Reasoning:       model.Reasoning,
				Attachment:      model.Attachment,
				Cost:            model.Cost,
				Modalities:      model.Modalities,
				Options:         model.Options,
				Variants:        model.Variants,
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
func applyModelVisibility(file document, entries []ModelVisibility) bool {
	providers := file.object("providers")
	changed := false
	for _, entry := range entries {
		providerID := strings.TrimSpace(entry.Provider)
		modelID := strings.TrimSpace(entry.Model)
		if providerID == "" || modelID == "" {
			continue
		}
		provider, ok := asDocument(providers[providerID])
		if !ok {
			continue
		}
		models, _ := provider["models"].([]any)
		for _, item := range models {
			model, ok := asDocument(item)
			if !ok {
				continue
			}
			if id := strings.TrimSpace(model.str("id")); id != modelID {
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
