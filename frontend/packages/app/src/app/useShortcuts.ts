import { onMount, type Accessor } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import type { SideTab } from "../lib/sessionTabs";
import { effectiveKeybinds, matchesKeybind, SESSION_SUMMARY_EVENT } from "../lib/keybinds";
import { cycleAgentID } from "../lib/slash";
import type { AgentProfile, AppPreferences } from "@lingzhu/ui/types";
import { useChatStore } from "../store/chat";
import { focusComposer, navigateMessage, toggleAutoApprove } from "../lib/shellActions";
import { useViewStore } from "../store/view";

interface Options {
  preferences: Accessor<AppPreferences>;
  /** The active session's agent, or empty when there is no session. */
  activeAgent: Accessor<string | undefined>;
  /** Whether a session is open; only its presence matters to the bindings. */
  hasActive: Accessor<boolean>;
  activeWorkspacePath: Accessor<string | undefined>;
  homeWorkspacePath: Accessor<string | undefined>;
  agents: Accessor<AgentProfile[]>;
  defaultAgent: Accessor<string>;
  homeAgent: Accessor<string>;
  setHomeAgent: (value: string) => void;
  sideTabs: Accessor<SideTab[]>;
  activeSideTab: Accessor<string | undefined>;
  atHome: Accessor<boolean>;
  reopenClosedTab: () => void;
  openNewTab: () => void;
  closeSideTab: (tab: SideTab) => void;
  selectSideTab: (tab: SideTab) => void;
  setSidebarOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setPanelOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  openManageModels: (connect: boolean) => void;
  setMCPTarget: (path?: string) => void;
  togglePalette: () => void;
}

/**
 * App-level keybinds and the small actions they share. Both listeners live
 * here so the shell only wires the values they need.
 *
 * The listeners are registered once and read the options accessors on each
 * event, so a streamed token never re-registers them.
 */
export function useShortcuts(options: Options) {
  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const preferences = options.preferences();
      const agents = options.agents();
      const keybinds = effectiveKeybinds(preferences.keybinds);
      const path = options.activeWorkspacePath() ?? options.homeWorkspacePath();
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
        options.togglePalette();
        return;
      }
      // The reference parks the command palette on Ctrl+P and Ctrl+K alike.
      if (!event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        options.togglePalette();
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
        options.setMCPTarget(path);
        return;
      }
      if (matchesKeybind(event, keybinds["model.choose"])) {
        event.preventDefault();
        options.openManageModels(false);
        return;
      }
      if (matchesKeybind(event, keybinds["agent.next"]) && agents.length > 1) {
        event.preventDefault();
        const delta = event.shiftKey ? -1 : 1;
        if (options.hasActive()) {
          const next = cycleAgentID(agents, options.activeAgent() || options.defaultAgent(), delta);
          if (next) void useChatStore.getState().selectAgent(next);
        } else {
          const next = cycleAgentID(agents, options.homeAgent(), delta);
          if (next) options.setHomeAgent(next);
        }
      }
    };
    makeEventListener(window, "keydown", onKeyDown);

    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const preferences = options.preferences();
      const sideTabs = options.sideTabs();
      const activeSideTab = options.activeSideTab();
      const keybinds = effectiveKeybinds(preferences.keybinds);
      if (matchesKeybind(event, keybinds["sidebar.toggle"])) {
        event.preventDefault();
        options.setSidebarOpen((value) => !value);
        return;
      }
      if (matchesKeybind(event, keybinds["home.toggle"])) {
        event.preventDefault();
        useViewStore.getState().showHome();
        return;
      }
      if (matchesKeybind(event, keybinds["tab.reopen"])) {
        event.preventDefault();
        options.reopenClosedTab();
        return;
      }
      if (matchesKeybind(event, keybinds["tab.new"])) {
        event.preventDefault();
        options.openNewTab();
        return;
      }
      if (matchesKeybind(event, keybinds["tab.close"])) {
        const tab = sideTabs.find((item) => item.key === activeSideTab);
        if (!tab?.closable) return;
        event.preventDefault();
        options.closeSideTab(tab);
        return;
      }
      if (matchesKeybind(event, keybinds["panel.review"])) {
        if (!options.hasActive()) return;
        event.preventDefault();
        options.setPanelOpen((value) => !value);
        return;
      }
      if (matchesKeybind(event, keybinds["session.summary"])) {
        if (!options.hasActive()) return;
        event.preventDefault();
        window.dispatchEvent(new Event(SESSION_SUMMARY_EVENT));
        return;
      }
      if (matchesKeybind(event, keybinds["tab.next"]) || matchesKeybind(event, keybinds["tab.previous"])) {
        if (sideTabs.length < 2) return;
        const index = sideTabs.findIndex((item) => item.key === activeSideTab);
        if (index < 0) return;
        event.preventDefault();
        const step = matchesKeybind(event, keybinds["tab.previous"]) ? -1 : 1;
        options.selectSideTab(sideTabs[(index + step + sideTabs.length) % sideTabs.length]);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const index = event.key === "9" ? sideTabs.length - 1 : Number(event.key) - 1;
        const tab = sideTabs[index];
        if (!tab) return;
        event.preventDefault();
        options.selectSideTab(tab);
      }
    };
    makeEventListener(window, "keydown", onKey);
  });
}
