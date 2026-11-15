import type { ModelSettings } from "@lingzhu/ui/types";

/** Selectable variant ids are base ids with this separator and the name. */
const VARIANT_SEPARATOR = "::";

export function modelVariantID(modelID: string, variant: string) {
  return `${modelID}${VARIANT_SEPARATOR}${variant}`;
}

export function splitModelID(id: string): { model: string; variant?: string } {
  const at = id.indexOf(VARIANT_SEPARATOR);
  if (at < 0) return { model: id };
  return { model: id.slice(0, at), variant: id.slice(at + VARIANT_SEPARATOR.length) };
}

export function modelLabel(model: ModelSettings, variant?: string) {
  const name = model.name || model.id;
  return variant ? `${name} · ${variant}` : name;
}

/**
 * Reasoning levels from least to most effort. Providers publish them in this
 * order and the reference lists them as published, while the settings object
 * arrives sorted by key, so the picker restores the published order.
 */
const VARIANT_RANK = ["none", "off", "minimal", "low", "medium", "high", "xhigh", "max", "thinking"];

/** Known levels in increasing effort, then any custom level by name. */
export function orderedVariants(variants: ModelSettings["variants"]): string[] {
  const rank = (id: string) => {
    const index = VARIANT_RANK.indexOf(id.toLowerCase());
    return index < 0 ? VARIANT_RANK.length : index;
  };
  return Object.keys(variants ?? {}).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
