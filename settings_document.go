package main

import "strings"

// document is one decoded JSON object. Editing it in place keeps fields this
// version does not know about, so a config written by a newer core survives a
// read-modify-write cycle.
type document map[string]any

// asDocument views a decoded JSON object through the document helpers. Both
// plain maps from encoding/json and documents written by this package match.
func asDocument(value any) (document, bool) {
	switch object := value.(type) {
	case document:
		return object, true
	case map[string]any:
		return document(object), true
	}
	return nil, false
}

func (d document) str(key string) string {
	value, _ := d[key].(string)
	return value
}

func (d document) boolean(key string) bool {
	value, _ := d[key].(bool)
	return value
}

func (d document) boolPtr(key string) *bool {
	value, ok := d[key].(bool)
	if !ok {
		return nil
	}
	return &value
}

func (d document) number(key string) float64 {
	value, _ := d[key].(float64)
	return value
}

// int reads a positive count; zero or a negative value means "unset".
func (d document) int(key string, fallback int) int {
	value, ok := d[key].(float64)
	if !ok {
		return fallback
	}
	n := int(value)
	if n <= 0 {
		return fallback
	}
	return n
}

// count reads a number where zero is meaningful, such as a context window that
// disables compaction.
func (d document) count(key string, fallback int) int {
	value, ok := d[key].(float64)
	if !ok {
		return fallback
	}
	n := int(value)
	if n < 0 {
		return fallback
	}
	return n
}

func (d document) object(key string) document {
	object, _ := asDocument(d[key])
	return object
}

func (d document) objects(key string) []document {
	raw, _ := d[key].([]any)
	out := make([]document, 0, len(raw))
	for _, item := range raw {
		if object, ok := asDocument(item); ok {
			out = append(out, object)
		}
	}
	return out
}

func (d document) strings(key string) []string {
	raw, _ := d[key].([]any)
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		text, _ := item.(string)
		if text = strings.TrimSpace(text); text != "" {
			out = append(out, text)
		}
	}
	return out
}

// setStrings writes a list and removes the key when it would be empty.
func (d document) setStrings(key string, values []string) {
	list := make([]any, 0, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			list = append(list, value)
		}
	}
	if len(list) == 0 {
		delete(d, key)
		return
	}
	d[key] = list
}

// mapValue reads a nested object as the plain map the wire types use.
func mapValue(d document, key string) map[string]any {
	object, ok := asDocument(d[key])
	if !ok || len(object) == 0 {
		return nil
	}
	return map[string]any(object)
}

func costSetting(raw any) *ModelCostSettings {
	entry, ok := asDocument(raw)
	if !ok || len(entry) == 0 {
		return nil
	}
	return &ModelCostSettings{
		Input:      entry.number("input"),
		Output:     entry.number("output"),
		CacheRead:  entry.number("cache_read"),
		CacheWrite: entry.number("cache_write"),
	}
}

func modalitiesSetting(raw any) *ModelModalitiesSettings {
	entry, ok := asDocument(raw)
	if !ok || len(entry) == 0 {
		return nil
	}
	input := entry.strings("input")
	output := entry.strings("output")
	if len(input) == 0 && len(output) == 0 {
		return nil
	}
	return &ModelModalitiesSettings{Input: input, Output: output}
}

func variantsSetting(d document) map[string]map[string]any {
	raw, _ := asDocument(d["variants"])
	out := map[string]map[string]any{}
	for name, item := range raw {
		name = strings.TrimSpace(name)
		variant, ok := asDocument(item)
		if name == "" || !ok {
			continue
		}
		out[name] = map[string]any(variant)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
