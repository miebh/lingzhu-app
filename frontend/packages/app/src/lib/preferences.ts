import type { AppPreferences } from "@lingzhu/ui/types";
import { setLanguage } from "@lingzhu/ui/i18n";
import { defaultTimelineDetail, timelineDetail } from "@lingzhu/session-ui/timeline-detail";

/** Used before the stored preferences load and when the store is unreadable. */
export const defaultPreferences: AppPreferences = {
  defaultWorkspace: "",
  workspaceDestination: "last-used",
  autoApprove: false,
  followUpBehavior: "steer",
  showAgent: true,
  showMessageAgent: false,
  spellcheck: true,
  foldUserMessages: true,
  showTurnDiffs: true,
  backgroundActivity: "left",
  newIcons: false,
  newQuestionUI: false,
  sounds: {
    agent: true,
    permissions: true,
    questions: true,
    errors: true,
    interface: true,
    tones: {},
  },
  defaultModel: { provider: "", model: "" },
  projectNames: {},
  projectAutoApprove: {},
  projectIcons: {},
  projectColors: {},
  projectWorktreeStartup: {},
  providerAccounts: {},
  activeProviderAccounts: {},
  favoriteModels: [],
  recentModels: [],
  hiddenModels: [],
  pinnedSessions: [],
  appearance: {
    density: "comfortable",
    timelineWidth: "comfortable",
    theme: "system",
    language: "en",
    sidebarOrganize: "list",
    timelineDetail: defaultTimelineDetail,
  },
  notifications: {
    agent: true,
    permissions: true,
    questions: true,
    errors: true,
  },
  keybinds: {},
};

let themePreference: AppPreferences["appearance"]["theme"] = "system";
let themeListening = false;

function systemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function paintTheme() {
  const theme =
    themePreference === "system" ? systemTheme() : themePreference;
  document.documentElement.dataset.colorScheme = theme;
}

function applyTheme(theme: AppPreferences["appearance"]["theme"]) {
  themePreference = theme;
  paintTheme();
  if (themeListening || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  themeListening = true;
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (themePreference === "system") paintTheme();
  });
}

/**
 * Coerces a stored preference document into complete arrays and enums. Older
 * builds serialized empty slices as null, so hydration must never trust shapes.
 */
export function normalizePreferences(value: Partial<AppPreferences> | null | undefined): AppPreferences {
  const input = value ?? {};
  const appearance = (input.appearance ?? {}) as Partial<AppPreferences["appearance"]>;
  return {
    ...defaultPreferences,
    ...input,
    defaultModel: input.defaultModel ?? defaultPreferences.defaultModel,
    projectNames: normalizeNames(input.projectNames),
    projectAutoApprove: normalizeFlags(input.projectAutoApprove),
    projectIcons: normalizeNames(input.projectIcons),
    projectColors: normalizeNames(input.projectColors),
    projectWorktreeStartup: normalizeNames(input.projectWorktreeStartup),
    providerAccounts: normalizeAccounts(input.providerAccounts),
    activeProviderAccounts: normalizeNames(input.activeProviderAccounts),
    favoriteModels: Array.isArray(input.favoriteModels) ? input.favoriteModels : [],
    recentModels: Array.isArray(input.recentModels) ? input.recentModels : [],
    hiddenModels: Array.isArray(input.hiddenModels) ? input.hiddenModels : [],
    pinnedSessions: Array.isArray(input.pinnedSessions)
      ? input.pinnedSessions.filter((id): id is string => typeof id === "string")
      : [],
    followUpBehavior: input.followUpBehavior === "queue" ? "queue" : "steer",
    showAgent: input.showAgent !== false,
    showMessageAgent: input.showMessageAgent === true,
    spellcheck: input.spellcheck !== false,
    foldUserMessages: input.foldUserMessages !== false,
    showTurnDiffs: input.showTurnDiffs !== false,
    workspaceDestination:
      input.workspaceDestination === "local" || input.workspaceDestination === "new"
        ? input.workspaceDestination
        : "last-used",
    backgroundActivity:
      input.backgroundActivity === "off" ||
      input.backgroundActivity === "center" ||
      input.backgroundActivity === "right"
        ? input.backgroundActivity
        : "left",
    newIcons: input.newIcons === true,
    newQuestionUI: input.newQuestionUI === true,
    sounds: {
      agent: input.sounds?.agent !== false,
      permissions: input.sounds?.permissions !== false,
      questions: input.sounds?.questions !== false,
      errors: input.sounds?.errors !== false,
      interface: input.sounds?.interface !== false,
      tones: normalizeNames(input.sounds?.tones),
    },
    appearance: {
      density: appearance.density === "compact" ? "compact" : "comfortable",
      timelineWidth:
        appearance.timelineWidth === "focused" || appearance.timelineWidth === "wide"
          ? appearance.timelineWidth
          : "comfortable",
      theme:
        appearance.theme === "dark" || appearance.theme === "light" ? appearance.theme : "system",
      language: appearance.language === "zh" ? "zh" : "en",
      sidebarOrganize: appearance.sidebarOrganize === "projects" ? "projects" : "list",
      timelineDetail: timelineDetail(appearance.timelineDetail),
    },
    notifications: {
      agent: input.notifications?.agent !== false,
      permissions: input.notifications?.permissions !== false,
      questions: input.notifications?.questions !== false,
      errors: input.notifications?.errors !== false,
    },
    keybinds: normalizeKeybinds(input.keybinds),
  };
}

function normalizeNames(value: Record<string, string> | undefined): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [path, name] of Object.entries(value)) {
    if (typeof name === "string" && name.trim()) out[path] = name.trim().slice(0, 128);
  }
  return out;
}

function normalizeFlags(value: Record<string, boolean> | undefined): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [path, enabled] of Object.entries(value)) {
    if (typeof enabled === "boolean") out[path] = enabled;
  }
  return out;
}

function normalizeAccounts(
  value: Record<string, { id: string; name: string; key: string }[]> | undefined,
): Record<string, { id: string; name: string; key: string }[]> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, { id: string; name: string; key: string }[]> = {};
  for (const [provider, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    out[provider] = list
      .filter((item) => item && typeof item.id === "string" && item.id.trim())
      .map((item) => ({
        id: item.id,
        name: typeof item.name === "string" ? item.name.slice(0, 128) : item.id,
        key: typeof item.key === "string" ? item.key : "",
      }));
  }
  return out;
}

function normalizeKeybinds(value: AppPreferences["keybinds"] | undefined): Record<string, string> {  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [action, binding] of Object.entries(value)) {
    if (typeof action !== "string" || typeof binding !== "string") continue;
    const trimmed = binding.trim();
    if (action.trim() && trimmed) out[action] = trimmed;
  }
  return out;
}

/**
 * Projects app preferences onto the root element. Appearance is pure client
 * state: CSS overrides the tokens declared in index.css, so nothing here
 * restarts a core.
 */
export function applyPreferences(preferences: AppPreferences) {
  const root = document.documentElement;
  root.dataset.density = preferences.appearance.density;
  root.dataset.timelineWidth = preferences.appearance.timelineWidth;
  if (preferences.newIcons) root.dataset.newIcons = "true";
  else delete root.dataset.newIcons;
  if (preferences.newQuestionUI) root.dataset.questionUi = "dock";
  else delete root.dataset.questionUi;
  applyTheme(preferences.appearance.theme);
  setLanguage(preferences.appearance.language);
}
