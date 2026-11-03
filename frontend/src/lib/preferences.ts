import type { AppPreferences } from "./types";

/** Used before the stored preferences load and when the store is unreadable. */
export const defaultPreferences: AppPreferences = {
  defaultWorkspace: "",
  autoApprove: false,
  defaultModel: { provider: "", model: "" },
  appearance: {
    fontFamily: "",
    density: "comfortable",
    timelineWidth: "comfortable",
    reduceMotion: "system",
  },
};

const DEFAULT_FONT = '"Inter", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif';

/**
 * Projects app preferences onto the root element. Appearance is pure client
 * state: CSS overrides the tokens declared in index.css, so nothing here
 * restarts a core.
 */
export function applyPreferences(preferences: AppPreferences) {
  const root = document.documentElement;
  const font = preferences.appearance.fontFamily.trim();
  if (font) root.style.setProperty("--font-sans", `${font}, ${DEFAULT_FONT}`);
  else root.style.removeProperty("--font-sans");

  root.dataset.density = preferences.appearance.density;
  root.dataset.timelineWidth = preferences.appearance.timelineWidth;
  if (preferences.appearance.reduceMotion === "system") {
    delete root.dataset.reduceMotion;
  } else {
    root.dataset.reduceMotion = preferences.appearance.reduceMotion;
  }
}
