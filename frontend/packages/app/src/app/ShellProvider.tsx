import { createMemo, createRoot, type Accessor, type JSX } from "solid-js";
import { useDialogBindings } from "./useDialogBindings";
import { useSessionActions } from "./useSessionActions";
import { useSessionTabs } from "./useSessionTabs";
import { useWorkspaceAgents } from "./useWorkspaceAgents";
import { effectiveKeybinds } from "../lib/keybinds";
import { t } from "@lingzhu/ui/i18n";
import { isFilePanelTab, CONFIG_FILE_TAB, type SidePanelTab, type SidePanelTabID } from "../lib/sidePanel";
import { chatKey } from "@lingzhu/ui/domain/chat";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
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
 * with their own selectors so streaming tokens never re-run this tree.
 *
 * The object is built once in a root scope: every field is a getter, so reading
 * `shell.activePath` inside JSX tracks the underlying store. Nested groups are
 * getter objects too, so destructuring `const { view } = shell` stays live.
 */
export interface Shell {
  preferences: ReturnType<ReturnType<typeof usePreferences>>;
  savePreferences: ReturnType<typeof usePreferencesStore.getState>["save"];
  catalog: ReturnType<ReturnType<typeof useCatalog>>;
  view: {
    tab: "chat" | "settings";
    settingsOpen: boolean;
    settingsSection: ReturnType<typeof useViewStore.getState>["settingsSection"];
    select: ReturnType<typeof useViewStore.getState>["select"];
    showChat: () => void;
    homeOpen: boolean;
    showHome: () => void;
    closeHome: () => void;
    openSettings: (section?: ReturnType<typeof useViewStore.getState>["settingsSection"]) => void;
    selectSettingsSection: (section: ReturnType<typeof useViewStore.getState>["settingsSection"]) => void;
    closeSettings: () => void;
  };
  workspaceList: Array<{
    path: string;
    name: string;
    addr: string;
    connected: boolean;
    starting?: boolean;
    error: string;
    icon?: string;
    color?: string;
  }>;
  workspaceRecords: ReturnType<ReturnType<typeof useWorkspaces>>;
  activePath: string | undefined;
  sessionsByWorkspace: ReturnType<ReturnType<typeof useSessionsByWorkspace>>;
  loadingSessions: Record<string, boolean>;
  sessionsLoading: boolean;
  workspaceSessionCounts: Record<string, number>;
  workspaceActions: {
    select: (path: string) => void;
    refresh: () => Promise<void>;
    loadSessions: (path: string) => Promise<void>;
    connect: () => Promise<WorkspaceInfo | undefined>;
    disconnect: (path: string) => Promise<void>;
    renameSession: (workspace: string, sessionID: string, title: string) => Promise<boolean>;
    deleteSession: (workspace: string, sessionID: string) => Promise<boolean>;
    deleteSessions: (workspace: string, sessionIDs: string[]) => Promise<string[]>;
  };
  chatActions: {
    open: (workspace: string, sessionID: string) => Promise<void>;
    newChat: (workspace: string) => Promise<void>;
    relocateDraft: (draftID: string, workspace: string) => boolean;
    send: (...args: any[]) => Promise<void>;
    runShell: (command: string) => Promise<void>;
    startSession: (...args: any[]) => Promise<void>;
    stop: () => Promise<void>;
    refresh: (workspace: string, sessionID: string) => Promise<void>;
    loadOlder: (workspace: string, sessionID: string) => void;
    selectModel: (providerID: string, modelID: string) => Promise<void>;
    selectAgent: (agentID: string) => Promise<void>;
    reply: (requestID: string, decision: string, message?: string) => Promise<void>;
    answerQuestion: (requestID: string, response: any) => Promise<void>;
    discard: (workspace: string, sessionID: string) => void;
    setTitle: (workspace: string, sessionID: string, title: string) => void;
  };
  activeId: string | undefined;
  home: ReturnType<ReturnType<typeof useChatHome>>;
  projectSelection: string | undefined;
  setProjectSelection: (value?: string) => void;
  homeProject: string | undefined;
  setHomeProject: (value?: string | ((current?: string) => string | undefined)) => void;
  settingsProject: string | undefined;
  setSettingsProject: (value?: string) => void;
  selectionReset: number;
  sideTabsWidth: number;
  setSideTabsWidth: (value: number) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  mobile: boolean;
  setMobile: (value: boolean) => void;
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (value: boolean) => void;
  panel: {
    panelOpen: boolean;
    setPanelOpen: (value: boolean | ((current: boolean) => boolean)) => void;
    panelTabs: SidePanelTabID[];
    setPanelTabs: (tabs: SidePanelTabID[]) => void;
    panelTab: SidePanelTabID;
    setPanelTab: (tab: SidePanelTabID) => void;
    panelTabsView: SidePanelTab[];
    openSidePanel: (tab?: SidePanelTabID) => void;
    addPanelTab: (id: SidePanelTabID) => void;
    openFileInPanel: (path: string) => void;
    closePanelTab: (id: SidePanelTabID) => void;
  };
  dialogs: ReturnType<typeof useDialogBindings>;
  activeWorkspace: Shell["workspaceList"][number] | undefined;
  activeKey: string | undefined;
  homeWorkspace: Shell["workspaceList"][number] | undefined;
  providers: NonNullable<Catalog["providers"]>;
  modelDisplayName: (providerID?: string, modelID?: string) => string;
  agents: ReturnType<typeof useWorkspaceAgents>;
  activeTabKey: string | undefined;
  tabs: ReturnType<typeof useSessionTabs>;
  sessionActions: ReturnType<typeof useSessionActions>;
  activeSideTab: string | undefined;
  keybinds: Record<string, string>;
  quote: { text: string; nonce: number } | undefined;
  quoteMessage: ((text: string) => void) | undefined;
  clearQuote: () => void;
  restorePrompt: { text: string; nonce: number } | undefined;
  restoreText: (text: string) => void;
  openProjectSettings: (path: string) => void;
}

const EMPTY_PROVIDERS: NonNullable<Catalog["providers"]> = [];

function getterObject<T extends object>(build: () => T): T {
  const target = {} as T;
  const sample = build();
  for (const key of Object.keys(sample) as Array<keyof T>) {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get: () => build()[key],
    });
  }
  return target;
}

function buildShell(): Shell {
  watchViewport();
  const preferences = usePreferences();
  const savePreferences = usePreferencesStore.getState().save;
  const catalog = useCatalog();

  const viewState = useViewStore((state) => ({
    tab: state.tab,
    settingsOpen: state.settingsOpen,
    settingsSection: state.settingsSection,
    homeOpen: state.homeOpen,
    select: state.select,
    showChat: state.showChat,
    showHome: state.showHome,
    closeHome: state.closeHome,
    openSettings: state.openSettings,
    selectSettingsSection: state.selectSettingsSection,
    closeSettings: state.closeSettings,
  }));
  const view = getterObject(() => {
    const state = viewState();
    return {
      tab: state.tab,
      settingsOpen: state.settingsOpen,
      settingsSection: state.settingsSection,
      homeOpen: state.homeOpen,
      select: state.select,
      showChat: state.showChat,
      showHome: state.showHome,
      closeHome: state.closeHome,
      openSettings: state.openSettings,
      selectSettingsSection: state.selectSettingsSection,
      closeSettings: state.closeSettings,
    };
  });

  const workspaceRecords = useWorkspaces();
  const workspaceList = createMemo(() => {
    const prefs = preferences();
    return workspaceRecords().map((workspace) => ({
      ...workspace,
      name: prefs.projectNames[workspace.path] || workspace.name,
      icon: prefs.projectIcons[workspace.path] || undefined,
      color: prefs.projectColors[workspace.path] || undefined,
    }));
  });

  const activePath = useActivePath();
  const sessionsByWorkspace = useSessionsByWorkspace();
  const loadingSessions = useWorkspaceStore((state) => state.loadingSessions);
  const sessionsLoading = useSessionsLoading();

  const workspaceActions = useWorkspaceStore((state) => ({
    select: state.select,
    refresh: state.refresh,
    loadSessions: state.loadSessions,
    connect: state.connect,
    disconnect: state.disconnect,
    renameSession: state.renameSession,
    deleteSession: state.deleteSession,
    deleteSessions: state.deleteSessions,
  }));

  const chatActions = useChatStore((state) => ({
    open: state.open,
    newChat: state.newChat,
    relocateDraft: state.relocateDraft,
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
  }));

  const ui = useUiStore((state) => ({
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
  }));

  const tabView = (id: SidePanelTabID): SidePanelTab => {
    if (isFilePanelTab(id)) {
      const path = id.slice(5);
      if (path === CONFIG_FILE_TAB) return { id, label: "lingzhu.json" };
      return { id, label: path.slice(path.lastIndexOf("/") + 1) || path };
    }
    return {
      id,
      label:
        id === "review"
          ? t("review")
          : id === "files"
            ? t("files")
            : id === "details"
              ? t("details")
              : t("plugins"),
    };
  };

  const panel = getterObject(() => {
    const state = ui();
    return {
      panelOpen: state.panelOpen,
      setPanelOpen: state.setPanelOpen,
      panelTabs: state.panelTabs,
      setPanelTabs: state.setPanelTabs,
      panelTab: state.panelTab,
      setPanelTab: state.setPanelTab,
      panelTabsView: state.panelTabs.map(tabView),
      openSidePanel: state.openSidePanel,
      addPanelTab: state.addPanelTab,
      openFileInPanel: state.openFileInPanel,
      closePanelTab: state.closePanelTab,
    };
  });

  const dialogs = useDialogBindings();
  const activeId = useActiveChatID();
  const home = useChatHome();

  const activeWorkspace = createMemo(() => workspaceList().find((workspace) => workspace.path === activePath()));
  const activeKey = createMemo(() => {
    const id = activeId();
    const path = activePath();
    return id && path ? chatKey(path, id) : undefined;
  });
  const homeWorkspace = createMemo(
    () => activeWorkspace() ?? workspaceList().find((workspace) => workspace.path === home().path),
  );

  const tabs = useSessionTabs({
    activePath,
    activeId,
    sessionsByWorkspace,
  });

  const sessionActions = useSessionActions({
    restorePrompt: ui().restoreText,
    removeSessionTabs: tabs.removeSessionTabs,
    onSelectionReset: ui().resetSelection,
  });

  const agents = useWorkspaceAgents(homeWorkspace);

  const providers = createMemo(() => catalog()?.providers ?? EMPTY_PROVIDERS);
  const modelDisplayName = (providerID?: string, modelID?: string) => {
    if (!modelID) return "";
    const [base, variant] = modelID.split("::");
    const name =
      providers().find((provider) => provider.id === providerID)?.models.find((model) => model.id === base)?.name ??
      base;
    return variant ? `${name} ${variant.charAt(0).toUpperCase()}${variant.slice(1)}` : name;
  };

  const keybinds = createMemo(() => effectiveKeybinds(preferences().keybinds));
  const activeSideTab = createMemo(() => (view.tab === "settings" ? "settings" : activeKey()));
  const workspaceSessionCounts = createMemo(() =>
    Object.fromEntries(
      Object.entries(sessionsByWorkspace()).map(([path, list]) => [path, (list ?? []).length]),
    ),
  );

  const openProjectSettings = (path: string) => {
    ui().setSettingsProject(path);
    view.openSettings("projects");
  };

  return getterObject<Shell>(() => ({
    preferences: preferences(),
    savePreferences,
    catalog: catalog(),
    view,
    workspaceList: workspaceList(),
    workspaceRecords: workspaceRecords(),
    activePath: activePath(),
    sessionsByWorkspace: sessionsByWorkspace(),
    loadingSessions: loadingSessions(),
    sessionsLoading: sessionsLoading(),
    workspaceSessionCounts: workspaceSessionCounts(),
    workspaceActions: workspaceActions(),
    chatActions: chatActions(),
    activeId: activeId(),
    home: home(),
    projectSelection: ui().projectSelection,
    setProjectSelection: ui().setProjectSelection,
    homeProject: ui().homeProject,
    setHomeProject: ui().setHomeProject,
    settingsProject: ui().settingsProject,
    setSettingsProject: ui().setSettingsProject,
    selectionReset: ui().selectionReset,
    sideTabsWidth: ui().sideTabsWidth,
    setSideTabsWidth: ui().setSideTabsWidth,
    sidebarOpen: ui().sidebarOpen,
    setSidebarOpen: ui().setSidebarOpen,
    mobile: ui().mobile,
    setMobile: ui().setMobile,
    mobileDrawerOpen: ui().mobileDrawerOpen,
    setMobileDrawerOpen: ui().setMobileDrawerOpen,
    panel,
    dialogs,
    activeWorkspace: activeWorkspace(),
    activeKey: activeKey(),
    homeWorkspace: homeWorkspace(),
    providers: providers(),
    modelDisplayName,
    agents,
    activeTabKey: activeKey(),
    tabs,
    sessionActions,
    activeSideTab: activeSideTab(),
    keybinds: keybinds(),
    quote: ui().quote,
    quoteMessage: ui().quoteText,
    clearQuote: ui().clearQuote,
    restorePrompt: ui().restorePrompt,
    restoreText: ui().restoreText,
    openProjectSettings,
  }));
}

let shell: Shell | undefined;

/** The shell state, built once for the lifetime of the window. */
export function useShell(): Shell {
  shell ??= createRoot(buildShell);
  return shell;
}

/** Kept as a no-op boundary so the app root keeps a single composition point. */
export function ShellProvider(props: { children?: JSX.Element }) {
  return <>{props.children}</>;
}

export type { Accessor };
