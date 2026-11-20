import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDialogBindings } from "./useDialogBindings";
import { useSessionActions } from "./useSessionActions";
import { useSessionTabs } from "./useSessionTabs";
import { useWorkspaceAgents } from "./useWorkspaceAgents";
import { effectiveKeybinds } from "../lib/keybinds";
import { t } from "@lingzhu/ui/i18n";
import { isFilePanelTab, CONFIG_FILE_TAB, type SidePanelTab, type SidePanelTabID } from "../lib/sidePanel";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { useCatalog } from "../store/catalog";
import type { Catalog } from "../store/catalog";
import { useActiveChatID, useChatHome, useChatStore } from "../store/chat";
import { usePreferences, usePreferencesStore } from "../store/preferences";
import { useUiStore, watchViewport } from "../store/ui";
import { useViewStore } from "../store/view";
import {
  useActivePath,
  useSessionsByWorkspace,
  useSessionsLoading,
  useWorkspaceStore,
  useWorkspaces,
} from "../store/workspaces";

/**
 * Shell composition state: layout, panel, dialogs, tabs and workspace data.
 * Chat/active-session data deliberately stays out; consumers subscribe to it
 * with their own selectors so streaming tokens never re-render this tree.
 */
const EMPTY_PROVIDERS: NonNullable<Catalog["providers"]> = [];

export function useShell() {
  const preferences = usePreferences();
  const savePreferences = usePreferencesStore((state) => state.save);
  const catalog = useCatalog();

  const view = useViewStore(
    useShallow((state) => ({
      tab: state.tab,
      settingsOpen: state.settingsOpen,
      settingsSection: state.settingsSection,
      select: state.select,
      showChat: state.showChat,
      homeOpen: state.homeOpen,
      showHome: state.showHome,
      closeHome: state.closeHome,
      openSettings: state.openSettings,
      selectSettingsSection: state.selectSettingsSection,
      closeSettings: state.closeSettings,
    })),
  );

  const workspaceRecords = useWorkspaces();
  // Project labels come from preferences, which `normalizePreferences` rebuilds
  // as fresh objects on every load and save. Reading them through refs keeps the
  // list identity stable, so effects keyed on the list do not re-run each render.
  const projectNames = useRef(preferences.projectNames);
  const projectIcons = useRef(preferences.projectIcons);
  const projectColors = useRef(preferences.projectColors);
  projectNames.current = preferences.projectNames;
  projectIcons.current = preferences.projectIcons;
  projectColors.current = preferences.projectColors;
  const workspaceList = useMemo(
    () =>
      workspaceRecords.map((workspace) => ({
        ...workspace,
        name: projectNames.current[workspace.path] || workspace.name,
        icon: projectIcons.current[workspace.path] || undefined,
        color: projectColors.current[workspace.path] || undefined,
      })),
    [workspaceRecords],
  );

  const activePath = useActivePath();
  const sessionsByWorkspace = useSessionsByWorkspace();
  const loadingSessions = useWorkspaceStore((state) => state.loadingSessions);
  const sessionsLoading = useSessionsLoading();
  const workspaceSessionCounts = Object.fromEntries(
    Object.entries(sessionsByWorkspace).map(([path, list]) => [path, (list ?? []).length]),
  );
  const workspaceActions = useWorkspaceStore(
    useShallow((state) => ({
      select: state.select,
      refresh: state.refresh,
      loadSessions: state.loadSessions,
      connect: state.connect,
      disconnect: state.disconnect,
      renameSession: state.renameSession,
      deleteSession: state.deleteSession,
      deleteSessions: state.deleteSessions,
    })),
  );
  const chatActions = useChatStore(
    useShallow((state) => ({
      open: state.open,
      newChat: state.newChat,
      send: state.send,
      runShell: state.runShell,
      startSession: state.startSession,
      stop: state.stop,
      refresh: state.refresh,
      loadOlder: state.loadOlder,
      selectModel: state.selectModel,
      selectAgent: state.selectAgent,
      reply: state.reply,
      answerQuestion: state.answerQuestion,
      discard: state.discard,
      setTitle: state.setTitle,
    })),
  );

  const ui = useUiStore(
    useShallow((state) => ({
      mobile: state.mobile,
      sidebarOpen: state.sidebarOpen,
      setSidebarOpen: state.setSidebarOpen,
      sideTabsWidth: state.sideTabsWidth,
      setSideTabsWidth: state.setSideTabsWidth,
      mobileDrawerOpen: state.mobileDrawerOpen,
      setMobileDrawerOpen: state.setMobileDrawerOpen,
      projectSelection: state.projectSelection,
      setProjectSelection: state.setProjectSelection,
      homeProject: state.homeProject,
      setHomeProject: state.setHomeProject,
      settingsProject: state.settingsProject,
      setSettingsProject: state.setSettingsProject,
      selectionReset: state.selectionReset,
      resetSelection: state.resetSelection,
      quote: state.quote,
      quoteText: state.quoteText,
      clearQuote: state.clearQuote,
      restorePrompt: state.restorePrompt,
      restoreText: state.restoreText,
      setMobile: state.setMobile,
      panelOpen: state.panelOpen,
      setPanelOpen: state.setPanelOpen,
      panelTabs: state.panelTabs,
      setPanelTabs: state.setPanelTabs,
      panelTab: state.panelTab,
      setPanelTab: state.setPanelTab,
      openSidePanel: state.openSidePanel,
      addPanelTab: state.addPanelTab,
      openFileInPanel: state.openFileInPanel,
      closePanelTab: state.closePanelTab,
    })),
  );
  const {
    mobile,
    sidebarOpen,
    setSidebarOpen,
    sideTabsWidth,
    setSideTabsWidth,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    projectSelection,
    setProjectSelection,
    homeProject,
    setHomeProject,
    settingsProject,
    setSettingsProject,
    selectionReset,
    quote,
    quoteText,
    clearQuote,
    restoreText,
  } = ui;

  // Panel state lives in the UI store, so every useShell() caller reads and
  // writes the same panel instead of owning a private copy.
  const tabView = (id: SidePanelTabID): SidePanelTab => {
    if (isFilePanelTab(id)) {
      const path = id.slice(5);
      if (path === CONFIG_FILE_TAB) return { id, label: "lingzhu.json" };
      return { id, label: path.slice(path.lastIndexOf("/") + 1) || path };
    }
    return {
      id,
      label: id === "review" ? t("review") : id === "files" ? t("files") : id === "details" ? t("details") : t("plugins"),
    };
  };
  const panelTabsView: SidePanelTab[] = ui.panelTabs.map(tabView);
  const panel = {
    panelOpen: ui.panelOpen,
    setPanelOpen: ui.setPanelOpen,
    panelTabs: ui.panelTabs,
    setPanelTabs: ui.setPanelTabs,
    panelTab: ui.panelTab,
    setPanelTab: ui.setPanelTab,
    panelTabsView,
    openSidePanel: ui.openSidePanel,
    addPanelTab: ui.addPanelTab,
    openFileInPanel: ui.openFileInPanel,
    closePanelTab: ui.closePanelTab,
  };
  const dialogs = useDialogBindings();
  const activeId = useActiveChatID();
  const home = useChatHome();

  useEffect(() => watchViewport(), []);

  const activeWorkspace = workspaceList.find((workspace) => workspace.path === activePath);
  const activeKey = activeId && activePath ? chatKey(activePath, activeId) : undefined;
  const homeWorkspace = activeWorkspace ?? workspaceList.find((workspace) => workspace.path === home.path);

  // `useSeenSessions`, `useSessionPrefetch` and the tab sync all write stores.
  // `useShell` is a plain hook called by every surface, so those effects run in
  // `ShellBridges` once instead of once per caller.

  const activeTabKey = activePath && activeId ? chatKey(activePath, activeId) : undefined;
  const tabs = useSessionTabs({
    activePath,
    activeId,
    sessionsByWorkspace,
  });

  const sessionActions = useSessionActions({
    restorePrompt: restoreText,
    removeSessionTabs: tabs.removeSessionTabs,
    onSelectionReset: ui.resetSelection,
  });

  const agents = useWorkspaceAgents(homeWorkspace);
  // A stable empty array keeps the memoized transcript rows from seeing a new
  // `providers` prop before the catalog loads.
  const providers = useMemo(() => catalog?.providers ?? EMPTY_PROVIDERS, [catalog]);

  // The transcript memoizes its rows on this callback, so it has to keep its
  // identity until the catalog itself changes.
  const modelDisplayName = useCallback(
    (providerID?: string, modelID?: string) => {
      if (!modelID) return "";
      const [base, variant] = modelID.split("::");
      const name =
        providers.find((provider) => provider.id === providerID)?.models.find((model) => model.id === base)?.name ??
        base;
      return variant ? `${name} ${variant.charAt(0).toUpperCase()}${variant.slice(1)}` : name;
    },
    [providers],
  );

  // A connected workspace that Home has not loaded yet starts loading so the
  // recent list is complete even when the project tree is closed. `useShell` is
  // a plain hook called by every surface, so this lives in `useSessionPrefetch`
  // and runs once from `ShellBridges` instead of once per caller.

  const activeSideTab = view.tab === "settings" ? "settings" : activeTabKey;
  const keybinds = effectiveKeybinds(preferences.keybinds);

  const openProjectSettings = (path: string) => {
    setSettingsProject(path);
    view.selectSettingsSection("projects");
    view.openSettings();
  };

  return {
    preferences,
    savePreferences,
    catalog,
    view,
    workspaceList,
    workspaceRecords,
    activePath,
    sessionsByWorkspace,
    loadingSessions,
    sessionsLoading,
    workspaceSessionCounts,
    workspaceActions,
    chatActions,
    activeId,
    home,
    projectSelection,
    setProjectSelection,
    homeProject,
    setHomeProject,
    settingsProject,
    setSettingsProject,
    selectionReset,
    sideTabsWidth,
    setSideTabsWidth,
    sidebarOpen,
    setSidebarOpen,
    mobile,
    setMobile: ui.setMobile,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    panel,
    dialogs,
    activeWorkspace,
    activeKey,
    homeWorkspace,
    providers,
    modelDisplayName,
    agents,
    activeTabKey,
    tabs,
    sessionActions,
    activeSideTab,
    keybinds,
    quote,
    quoteMessage: quoteText,
    clearQuote,
    restorePrompt: ui.restorePrompt,
    restoreText,
    openProjectSettings,
  };
}

/** Kept as a no-op boundary so the app root keeps a single composition point. */
export function ShellProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
