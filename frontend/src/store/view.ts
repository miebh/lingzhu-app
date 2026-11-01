import { create } from "zustand";
import type { AppTabID } from "../components/TabBar";

interface ViewStore {
  tab: AppTabID;
  settingsOpen: boolean;
  select: (tab: AppTabID) => void;
  showChat: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

/**
 * Which page fills the main pane. Settings is an overlay tab, so opening it
 * must not lose the chat's scroll position or composer draft.
 */
export const useViewStore = create<ViewStore>((set) => ({
  tab: "chat",
  settingsOpen: false,

  select: (next) => set({ tab: next }),
  showChat: () => set({ tab: "chat" }),
  openSettings: () => set({ settingsOpen: true, tab: "settings" }),
  closeSettings: () =>
    set((state) => ({ settingsOpen: false, tab: state.tab === "settings" ? "chat" : state.tab })),
}));
