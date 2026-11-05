import type { ModelSettings } from "./types";

/** Selectable variant ids are base ids with this separator and the name. */
export const VARIANT_SEPARATOR = "::";

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
