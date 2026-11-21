import { createStore } from "./create";
import { currentHref, navigateTo } from "../lib/navigation";
import { homeHref, newSessionHref, routeView, settingsHref } from "../lib/routes";
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
  /** Projects the router's pathname onto the shell's view flags. */
  syncRoute: (href: string) => void;
}

/** Where "back" from settings lands: the last non-settings route. */
let returnHref = homeHref();

/**
 * Which page fills the main pane. The URL is the source of truth; these flags
 * are the projection the shell surfaces read, so component tests can set them
 * without a router. Navigation methods update both the projection and the URL.
 */
export const useViewStore = createStore<ViewStore>((set) => ({
  tab: "chat",
  settingsOpen: false,
  settingsSection: "general",
  // The reference opens on Home (Projects beside recent sessions); the router
  // starts there too.
  homeOpen: true,

  select: (next) => set({ tab: next, homeOpen: false }),
  showChat: () => set({ tab: "chat", homeOpen: false }),
  showHome: () => {
    set({ tab: "chat", settingsOpen: false, homeOpen: true });
    navigateTo(homeHref());
  },
  closeHome: () => {
    set({ homeOpen: false });
    navigateTo(newSessionHref());
  },
  openSettings: (section = "general") => {
    const current = currentHref();
    if (!routeView(current).settingsOpen) returnHref = current;
    set({ settingsOpen: true, tab: "settings", settingsSection: section });
    navigateTo(settingsHref(section));
  },
  selectSettingsSection: (settingsSection) => {
    set({ settingsSection });
    navigateTo(settingsHref(settingsSection), { replace: true });
  },
  closeSettings: () => {
    set({ settingsOpen: false, tab: "chat" });
    navigateTo(returnHref);
  },
  syncRoute: (href) => {
    const view = routeView(href);
    if (!view.settingsOpen) returnHref = href;
    set((state) =>
      state.tab === view.tab &&
      state.homeOpen === view.homeOpen &&
      state.settingsOpen === view.settingsOpen &&
      state.settingsSection === view.settingsSection
        ? state
        : {
            tab: view.tab,
            homeOpen: view.homeOpen,
            settingsOpen: view.settingsOpen,
            settingsSection: view.settingsSection as SettingsSectionID,
          },
    );
  },
}));
