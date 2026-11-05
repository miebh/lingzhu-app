import { create } from "zustand";
import type { AppTabID } from "../components/TabBar";
import type { SettingsSectionID } from "../components/settings/types";

interface ViewStore {
  tab: AppTabID;
  settingsOpen: boolean;
  settingsSection: SettingsSectionID;
  select: (tab: AppTabID) => void;
  showChat: () => void;
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

  select: (next) => set({ tab: next }),
  showChat: () => set({ tab: "chat" }),
  openSettings: (section = "general") => set({ settingsOpen: true, tab: "settings", settingsSection: section }),
  selectSettingsSection: (settingsSection) => set({ settingsSection }),
  closeSettings: () =>
    set((state) => ({ settingsOpen: false, tab: state.tab === "settings" ? "chat" : state.tab })),
}));
