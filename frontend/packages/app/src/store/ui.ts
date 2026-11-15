import { create } from "zustand";
import { addPanelTab, closePanelTabState } from "../lib/panelTabs";
import { DEFAULT_SIDE_PANEL_TAB, isSidePanelTabID, type SidePanelTabID } from "../lib/sidePanel";

function readSideTabsWidth() {
  const saved = Number(localStorage.getItem("lingzhu.sideTabsWidth"));
  return Number.isFinite(saved) && saved > 0 ? Math.min(640, Math.max(136, saved)) : 240;
}

function readSidebarOpen() {
  return localStorage.getItem("lingzhu.sidebarOpen") !== "false";
}

function readPanelOpen() {
  return localStorage.getItem("lingzhu.sidePanelOpen") === "true";
}

function readPanelTabs(): SidePanelTabID[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("lingzhu.sidePanelTabs") ?? "[]");
    const valid = Array.isArray(parsed) ? parsed.filter(isSidePanelTabID) : [];
    return valid.length > 0 ? valid : [DEFAULT_SIDE_PANEL_TAB];
  } catch {
    return [DEFAULT_SIDE_PANEL_TAB];
  }
}

/**
 * The panel's first frame. The strip and the pane must agree, so the shown tab
 * is the stored default when that view is in the strip and its first entry
 * otherwise.
 */
function readPanelState(): { panelTabs: SidePanelTabID[]; panelTab: SidePanelTabID } {
  const panelTabs = readPanelTabs();
  const panelTab = panelTabs.includes(DEFAULT_SIDE_PANEL_TAB) ? DEFAULT_SIDE_PANEL_TAB : panelTabs[0];
  return { panelTabs, panelTab };
}

/**
 * Shell UI state: layout, side panel, selection filters and the transient
 * composer hand-offs. It lives in a store rather than a provider so any
 * component can read one slice without subscribing to chats or sessions.
 */interface UiStore {
  mobile: boolean;
  sidebarOpen: boolean;
  sideTabsWidth: number;
  mobileDrawerOpen: boolean;

  projectSelection?: string;
  homeProject?: string;
  settingsProject?: string;
  selectionReset: number;

  panelOpen: boolean;
  panelTabs: SidePanelTabID[];
  panelTab: SidePanelTabID;

  quote?: { text: string; nonce: number };
  restorePrompt?: { text: string; nonce: number };

  setMobile: (value: boolean) => void;
  setSidebarOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setSideTabsWidth: (value: number) => void;
  setMobileDrawerOpen: (value: boolean) => void;
  setProjectSelection: (value?: string) => void;
  setHomeProject: (value?: string | ((current?: string) => string | undefined)) => void;
  setSettingsProject: (value?: string) => void;
  resetSelection: () => void;
  setPanelOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setPanelTabs: (tabs: SidePanelTabID[]) => void;
  setPanelTab: (tab: SidePanelTabID) => void;
  openSidePanel: (tab?: SidePanelTabID) => void;
  /** Adds a view to the first pane without opening a second one. */
  addPanelTab: (id: SidePanelTabID) => void;
  openFileInPanel: (path: string) => void;
  closePanelTab: (id: SidePanelTabID) => void;
  quoteText: (text: string) => void;
  clearQuote: () => void;
  restoreText: (text: string) => void;
}

const initialPanel = readPanelState();

export const useUiStore = create<UiStore>((set, get) => ({
  mobile: typeof window !== "undefined" && window.innerWidth < 768,
  sidebarOpen: readSidebarOpen(),
  sideTabsWidth: readSideTabsWidth(),
  mobileDrawerOpen: false,

  projectSelection: undefined,
  homeProject: undefined,
  settingsProject: undefined,
  selectionReset: 0,

  panelOpen: readPanelOpen(),
  panelTabs: initialPanel.panelTabs,
  panelTab: initialPanel.panelTab,

  quote: undefined,
  restorePrompt: undefined,

  // Window resizes fire a resize event per frame. Writing the same value would
  // still mint a new state object and re-render every shell consumer, so the
  // breakpoint only commits when it actually flips.
  setMobile: (mobile) => {
    if (get().mobile === mobile) return;
    set({ mobile });
  },

  setSidebarOpen: (value) => {
    const next = typeof value === "function" ? value(get().sidebarOpen) : value;
    localStorage.setItem("lingzhu.sidebarOpen", String(next));
    set({ sidebarOpen: next });
  },

  setSideTabsWidth: (width) => {
    localStorage.setItem("lingzhu.sideTabsWidth", String(width));
    set({ sideTabsWidth: width });
  },

  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
  setProjectSelection: (projectSelection) => set({ projectSelection }),
  setHomeProject: (value) =>
    set((state) => ({
      homeProject: typeof value === "function" ? value(state.homeProject) : value,
    })),
  setSettingsProject: (settingsProject) => set({ settingsProject }),
  resetSelection: () => set((state) => ({ selectionReset: state.selectionReset + 1 })),

  setPanelOpen: (value) => {
    const next = typeof value === "function" ? value(get().panelOpen) : value;
    localStorage.setItem("lingzhu.sidePanelOpen", String(next));
    set({ panelOpen: next });
  },

  setPanelTabs: (panelTabs) => {
    localStorage.setItem("lingzhu.sidePanelTabs", JSON.stringify(panelTabs));
    set({ panelTabs });
  },

  setPanelTab: (panelTab) => set({ panelTab }),

  openSidePanel: (tab = DEFAULT_SIDE_PANEL_TAB) => {
    const tabs = addPanelTab(get().panelTabs, tab);
    localStorage.setItem("lingzhu.sidePanelTabs", JSON.stringify(tabs));
    localStorage.setItem("lingzhu.sidePanelOpen", "true");
    set({ panelTabs: tabs, panelTab: tab, panelOpen: true });
  },

  addPanelTab: (id) => {
    const tabs = addPanelTab(get().panelTabs, id);
    localStorage.setItem("lingzhu.sidePanelTabs", JSON.stringify(tabs));
    localStorage.setItem("lingzhu.sidePanelOpen", "true");
    set({ panelTabs: tabs, panelTab: id, panelOpen: true });
  },

  openFileInPanel: (path) => {
    const id: SidePanelTabID = `file:${path}`;
    const tabs = addPanelTab(get().panelTabs, id);
    localStorage.setItem("lingzhu.sidePanelTabs", JSON.stringify(tabs));
    localStorage.setItem("lingzhu.sidePanelOpen", "true");
    set({ panelTabs: tabs, panelTab: id, panelOpen: true });
  },

  closePanelTab: (id) => {
    const next = closePanelTabState({ tabs: get().panelTabs, active: get().panelTab, closing: id });
    if (!next.open) {
      localStorage.setItem("lingzhu.sidePanelOpen", "false");
      set({ panelOpen: false });
      return;
    }
    localStorage.setItem("lingzhu.sidePanelTabs", JSON.stringify(next.tabs));
    set({ panelTabs: next.tabs, panelTab: next.active });
  },

  quoteText: (text) => set((state) => ({ quote: { text, nonce: (state.quote?.nonce ?? 0) + 1 } })),
  clearQuote: () => set({ quote: undefined }),
  restoreText: (text) => set({ restorePrompt: { text, nonce: Date.now() } }),
}));

/** Applies the stored window size to the mobile breakpoint. */
export function watchViewport() {
  const apply = () => useUiStore.getState().setMobile(window.innerWidth < 768);
  apply();
  window.addEventListener("resize", apply);
  return () => window.removeEventListener("resize", apply);
}
