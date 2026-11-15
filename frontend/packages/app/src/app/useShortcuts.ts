import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SideTab } from "../lib/sessionTabs";
import { effectiveKeybinds, matchesKeybind } from "../lib/keybinds";
import { cycleAgentID } from "../lib/slash";
import type { AgentProfile, AppPreferences } from "@lingzhu/ui/types";
import { useChatStore } from "../store/chat";
import { focusComposer, navigateMessage, toggleAutoApprove } from "../lib/shellActions";
import { usePreferencesStore } from "../store/preferences";
import { useViewStore } from "../store/view";

interface Options {
  preferences: AppPreferences;
  savePreferences: (next: AppPreferences) => void | Promise<void>;
  /** The active session's agent, or empty when there is no session. */
  activeAgent?: string;
  /** Whether a session is open; only its presence matters to the bindings. */
  hasActive: boolean;
  activeWorkspacePath?: string;
  homeWorkspacePath?: string;
  agents: AgentProfile[];
  defaultAgent: string;
  homeAgent: string;
  setHomeAgent: Dispatch<SetStateAction<string>>;
  sideTabs: SideTab[];
  activeSideTab?: string;
  resolvedLayout: "horizontal" | "vertical" | "inbox";
  atHome: boolean;
  reopenClosedTab: () => void;
  openNewTab: () => void;
  closeSideTab: (tab: SideTab) => void;
  selectSideTab: (tab: SideTab) => void;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setPanelOpen: Dispatch<SetStateAction<boolean>>;
  openManageModels: (connect: boolean) => void;
  setMCPTarget: (path?: string) => void;
  togglePalette: () => void;
}

/**
 * App-level keybinds, pointer zoom and the small actions they share. Both
 * listeners live here so the shell only wires the values they need.
 *
 * The listeners read the latest options from a ref and are registered once.
 * Their inputs change on every streamed token, and tearing down three window
 * listeners per token would cost more than the keypresses they serve.
 */
export function useShortcuts(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const {
        preferences,
        activeAgent,
        hasActive,
        activeWorkspacePath,
        homeWorkspacePath,
        agents,
        defaultAgent,
        homeAgent,
        setHomeAgent,
        setMCPTarget,
        openManageModels,
        togglePalette,
      } = latest.current;
      const keybinds = effectiveKeybinds(preferences.keybinds);
      const path = activeWorkspacePath ?? homeWorkspacePath;
      if (matchesKeybind(event, keybinds["message.previous"])) {
        event.preventDefault();
        navigateMessage(-1);
        return;
      }
      if (matchesKeybind(event, keybinds["message.next"])) {
        event.preventDefault();
        navigateMessage(1);
        return;
      }
      if (matchesKeybind(event, keybinds.palette)) {
        event.preventDefault();
        togglePalette();
        return;
      }
      // The reference parks the command palette on Ctrl+P and Ctrl+K alike.
      if (!event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        togglePalette();
        return;
      }
      if (matchesKeybind(event, keybinds["settings.open"])) {
        event.preventDefault();
        useViewStore.getState().openSettings();
        return;
      }
      if (matchesKeybind(event, keybinds["input.focus"])) {
        event.preventDefault();
        focusComposer();
        return;
      }
      if (matchesKeybind(event, keybinds["permissions.auto"])) {
        event.preventDefault();
        toggleAutoApprove();
        return;
      }
      if (event.key === ";" && path && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setMCPTarget(path);
        return;
      }
      if (matchesKeybind(event, keybinds["model.choose"])) {
        event.preventDefault();
        openManageModels(false);
        return;
      }
      if (matchesKeybind(event, keybinds["agent.next"]) && agents.length > 1) {
        event.preventDefault();
        const delta = event.shiftKey ? -1 : 1;
        if (hasActive) {
          const next = cycleAgentID(agents, activeAgent || defaultAgent, delta);
          if (next) void useChatStore.getState().selectAgent(next);
        } else {
          const next = cycleAgentID(agents, homeAgent, delta);
          if (next) setHomeAgent(next);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Trackpad pinch and Ctrl-scroll change the UI zoom when the setting allows it.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      if (!latest.current.preferences.pinchZoom) return;
      event.preventDefault();
      const current = usePreferencesStore.getState().preferences;
      const zoom = current.appearance.zoom;
      const next = Math.max(80, Math.min(150, zoom + (event.deltaY < 0 ? 10 : -10)));
      if (next === zoom) return;
      void latest.current.savePreferences({ ...current, appearance: { ...current.appearance, zoom: next } });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const {
        preferences,
        hasActive,
        sideTabs,
        activeSideTab,
        resolvedLayout,
        reopenClosedTab,
        openNewTab,
        closeSideTab,
        selectSideTab,
        setSidebarOpen,
        setPanelOpen,
      } = latest.current;
      const keybinds = effectiveKeybinds(preferences.keybinds);
      if (matchesKeybind(event, keybinds["sidebar.toggle"])) {
        if (resolvedLayout === "horizontal") return;
        event.preventDefault();
        setSidebarOpen((value) => !value);
        return;
      }
      if (matchesKeybind(event, keybinds["home.toggle"])) {
        event.preventDefault();
        useViewStore.getState().showHome();
        return;
      }
      if (matchesKeybind(event, keybinds["tab.reopen"])) {
        event.preventDefault();
        reopenClosedTab();
        return;
      }
      if (matchesKeybind(event, keybinds["tab.new"])) {
        event.preventDefault();
        openNewTab();
        return;
      }
      if (matchesKeybind(event, keybinds["tab.close"])) {
        const tab = sideTabs.find((item) => item.key === activeSideTab);
        if (!tab?.closable) return;
        event.preventDefault();
        closeSideTab(tab);
        return;
      }
      if (matchesKeybind(event, keybinds["panel.review"])) {
        if (!hasActive) return;
        event.preventDefault();
        setPanelOpen((value) => !value);
        return;
      }
      if (matchesKeybind(event, keybinds["tab.next"]) || matchesKeybind(event, keybinds["tab.previous"])) {
        if (sideTabs.length < 2) return;
        const index = sideTabs.findIndex((item) => item.key === activeSideTab);
        if (index < 0) return;
        event.preventDefault();
        const step = matchesKeybind(event, keybinds["tab.previous"]) ? -1 : 1;
        selectSideTab(sideTabs[(index + step + sideTabs.length) % sideTabs.length]);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const index = event.key === "9" ? sideTabs.length - 1 : Number(event.key) - 1;
        const tab = sideTabs[index];
        if (!tab) return;
        event.preventDefault();
        selectSideTab(tab);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
