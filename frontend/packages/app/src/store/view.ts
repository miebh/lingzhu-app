import { create } from "zustand";
import type { SettingsSectionID } from "../lib/settings";

/** Page filling the main pane. Chat is permanent; settings joins as an overlay. */
export type AppTabID = "chat" | "settings";

interface ViewStore {
  tab: AppTabID;
  settingsOpen: boolean;
  settingsSection: SettingsSectionID;
  /** The home dashboard fills the main pane until a session is picked. */
  homeOpen: boolean;
  select: (tab: AppTabID) => void;
  showChat: () => void;
  showHome: () => void;
  closeHome: () => void;
  openSettings: (section?: SettingsSectionID) => void;
  selectSettingsSection: (section: SettingsSectionID) => void;
  closeSettings: () => void;
}

/**
 * Which page fills the main pane. Settings is an overlay tab, so opening it
 * must not lose the chat's scroll position or composer draft.
 */
export const useViewStore = create<ViewStore>((set) => ({
  tab: "chat",
  settingsOpen: false,
  settingsSection: "general",
  // The reference opens on Home (Projects beside recent sessions); a draft tab
  // switches to the new-session surface instead.
  homeOpen: true,

  select: (next) => set({ tab: next, homeOpen: false }),
  showChat: () => set({ tab: "chat", homeOpen: false }),
  showHome: () => set({ tab: "chat", settingsOpen: false, homeOpen: true }),
  closeHome: () => set({ homeOpen: false }),
  openSettings: (section = "general") =>
    set({ settingsOpen: true, tab: "settings", settingsSection: section }),
  selectSettingsSection: (settingsSection) => set({ settingsSection }),
  closeSettings: () =>
    set((state) => ({ settingsOpen: false, tab: state.tab === "settings" ? "chat" : state.tab })),
}));
