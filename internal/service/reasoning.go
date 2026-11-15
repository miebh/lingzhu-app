package service

import "strings"

// Toggle-only reasoning models name their variants off/thinking instead of an
// effort level. The distinct ids keep a level named "none" unambiguous.
const (
	variantOff      = "off"
	variantThinking = "thinking"
)

// reasoningVariants turns discovered reasoning controls into named option
// overrides. Effort levels become reasoning_effort values; a toggle model also
// gets explicit off/thinking entries. It returns nil when the model exposes no
// control, which keeps the base model the only picker row.
func reasoningVariants(efforts []string, toggle bool) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, level := range efforts {
		level = strings.ToLower(strings.TrimSpace(level))
		if level == "" || level == "default" || strings.Contains(level, "::") {
			continue
		}
		out[level] = map[string]any{"reasoning_effort": level}
	}
	if toggle {
		out[variantOff] = map[string]any{"thinking": map[string]any{"type": "disabled"}}
		out[variantThinking] = map[string]any{"thinking": map[string]any{"type": "enabled"}}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
