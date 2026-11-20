import type { Dispatch, SetStateAction } from "react";
import type { SidePanelTabID } from "../lib/sidePanel";
import type { SideTab } from "../lib/sessionTabs";
import { relativeTime } from "../lib/history";
import { effectiveKeybinds } from "../lib/keybinds";
import { messageOf } from "../lib/errors";
import { paletteVariant, type PaletteCommand } from "../lib/palette";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type AppPreferences, type ChatState, type SessionInfo, type WorkspaceInfo } from "@lingzhu/ui/types";
import type { t as translate } from "@lingzhu/ui/i18n";
import { notify } from "../store/notify";
import type { SessionDialogTarget } from "../store/dialogs";
import type { useDialogBindings } from "./useDialogBindings";

/** Translator the palette is built with; passed in so the shell owns reactivity. */
export type Translate = typeof translate;

export interface PaletteContext {
  active?: ChatState;
  activeWorkspace?: WorkspaceInfo;
  workspaceList: WorkspaceInfo[];
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  chats: Record<string, ChatState>;
  seenSessions: Record<string, string>;
  activeKey?: string;
  sideTabs: SideTab[];
  activeSideTab?: string;
  revertCan: { undo: boolean; redo: boolean };
  preferences: AppPreferences;
  savePreferences: (next: AppPreferences) => void | Promise<void>;
  view: { openSettings: () => void; showChat: () => void };
  workspaceActions: {
    connect: () => unknown;
    loadSessions: (path: string) => unknown;
    select: (path: string) => void;
  };
  chatActions: {
    newChat: (path: string) => unknown;
    open: (path: string, sessionID: string) => unknown;
  };
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setPanelOpen: Dispatch<SetStateAction<boolean>>;
  /** Opens the context tab, or closes the panel when it already shows it. */
  focusComposer: () => void;
  toggleAutoApprove: () => void;
  openSidePanel: (tab?: SidePanelTabID) => void;
  reopenClosedTab: () => void;
  closeSideTab: (tab: SideTab) => void;
  navigateMessage: (offset: -1 | 1) => void;
  forkSession: (path: string, session: SessionInfo) => void;
  undoLatestTurn: (path: string, sessionID: string, text?: string) => Promise<void>;
  redoLatestTurn: (path: string, sessionID: string) => Promise<void>;
  openSummary: (target: SessionDialogTarget) => Promise<void>;
  compactSession: (target: SessionDialogTarget) => void | Promise<void>;
  dialogs: ReturnType<typeof useDialogBindings>;
}

/**
 * Builds the command palette list. Every entry is data describing a shortcut,
 * so the shell only supplies the actions and the dialog setters it already owns.
 */
export function buildPaletteCommands(ctx: PaletteContext, tr: Translate): PaletteCommand[] {
  const {
    active,
    activeWorkspace,
    workspaceList,
    sessionsByWorkspace,
    chats,
    seenSessions,
    activeKey,
    sideTabs,
    activeSideTab,
    revertCan,
    preferences,
    savePreferences,
    view,
    workspaceActions,
    chatActions,
    setSidebarOpen,
    setPanelOpen,
    focusComposer,
    toggleAutoApprove,
    openSidePanel,
    reopenClosedTab,
    closeSideTab,
    navigateMessage,
    forkSession,
    compactSession,
    undoLatestTurn,
    redoLatestTurn,
    openSummary,
  } = ctx;
  const {
    setSearchTarget,
    setSourceControlTarget,
    setWorktreesTarget,
    setProjectTarget,
    setServicesTarget,
    setCoreTarget,
    setCoreModelsTarget,
    setMCPTarget,
    setPluginsTarget,
    setSchedulesOverviewTarget,
    setJobsOverviewTarget,
    setUsageOverviewTarget,
    setLiveEventsTarget,
    setWebSearchTarget,
    setImageGenTarget,
    setFormattersTarget,
    setOAuthTarget,
    setTransferTarget,
    setShareTarget,
    setRevertTarget,
    setLogTarget,
    setUsageTarget,
    setInboxTarget,
    setFormsTarget,
    setJobsTarget,
    setSkillsTarget,
    setPairingTarget,
    setMediaTarget,
    setReferencesTarget,
    setEnvironmentTarget,
    setRunCommandTarget,
    setPromptOnceTarget,
    setSyntheticTarget,
    setWaitTarget,
    setRenameTarget,
    setMoveTarget,
    setDeleteTarget,
    setSchedulesTarget,
  } = ctx.dialogs;

  const paletteTarget =
    active && activeWorkspace
      ? {
          workspace: activeWorkspace.path,
          sessionID: active.id,
          title: active.title || active.id,
        }
      : undefined;
  const paletteSession =
    active && activeWorkspace
      ? sessionsByWorkspace[activeWorkspace.path]?.find((session) => session.id === active.id)
      : undefined;

  const paletteCommands: PaletteCommand[] = [
    {
      id: "settings",
      title: tr("paletteOpenSettings"),
      group: tr("paletteGroupCommands"),
      kind: "setting",
      keywords: ["preferences", "options"],
      run: () => view.openSettings(),
    },
    {
      id: "add-workspace",
      title: tr("paletteAddWorkspace"),
      group: tr("paletteGroupCommands"),
      featured: true,
      keywords: ["folder", "project", "open"],
      run: () => void workspaceActions.connect(),
    },
    {
      id: "focus-input",
      title: tr("paletteFocusInput"),
      group: tr("paletteGroupCommands"),
      keybind: effectiveKeybinds(preferences.keybinds)["input.focus"],
      keywords: ["composer", "message"],
      run: focusComposer,
    },
    {
      id: "auto-accept",
      title: tr(preferences.autoApprove ? "paletteAutoAcceptOff" : "paletteAutoAcceptOn"),
      group: tr("paletteGroupCommands"),
      keybind: effectiveKeybinds(preferences.keybinds)["permissions.auto"],
      keywords: ["permissions", "approve"],
      run: toggleAutoApprove,
    },
    {
      id: "toggle-sidebar",
      title: tr("paletteToggleSidebar"),
      group: tr("paletteGroupView"),
      keybind: effectiveKeybinds(preferences.keybinds)["sidebar.toggle"],
      keywords: ["rail", "panel", "hide", "side"],
      run: () => setSidebarOpen((value) => !value),
    },
    {
      id: "toggle-review",
      title: tr("paletteToggleReview"),
      group: tr("paletteGroupView"),
      keybind: effectiveKeybinds(preferences.keybinds)["panel.review"],
      keywords: ["panel", "diff", "files", "side"],
      run: () => setPanelOpen((value) => !value),
    },
    {
      id: "reopen-tab",
      title: tr("paletteReopenTab"),
      group: tr("paletteGroupView"),
      keybind: effectiveKeybinds(preferences.keybinds)["tab.reopen"],
      keywords: ["tab", "restore", "undo"],
      run: reopenClosedTab,
    },
    {
      id: "close-tab",
      title: tr("paletteCloseTab"),
      group: tr("paletteGroupView"),
      keybind: effectiveKeybinds(preferences.keybinds)["tab.close"],
      keywords: ["tab", "dismiss"],
      run: () => {
        const tab = sideTabs.find((item) => item.key === activeSideTab);
        if (tab?.closable) closeSideTab(tab);
      },
    },
    {
      id: "layout-top",
      title: tr("paletteLayoutTop"),
      group: tr("paletteGroupView"),
      keywords: ["interface", "horizontal", "titlebar"],
      run: () =>
        void savePreferences({
          ...preferences,
          appearance: { ...preferences.appearance, tabLayout: "horizontal" },
        }),
    },
    {
      id: "layout-side",
      title: tr("paletteLayoutSide"),
      group: tr("paletteGroupView"),
      keywords: ["interface", "vertical", "rail"],
      run: () =>
        void savePreferences({
          ...preferences,
          appearance: { ...preferences.appearance, tabLayout: "vertical" },
        }),
    },  ];

  if (activeWorkspace) {
    const path = activeWorkspace.path;
    paletteCommands.push(
      {
        id: "new-session",
        title: tr("paletteNewSession"),
        group: tr("paletteGroupCommands"),
        featured: true,
        keywords: ["chat", "create"],
        run: () => void chatActions.newChat(path),
      },
      {
        id: "search-sessions",
        title: tr("paletteSearchSessions"),
        group: tr("paletteGroupCommands"),
        keywords: ["find", "history"],
        run: () => setSearchTarget(path),
      },
      {
        id: "refresh-sessions",
        title: tr("paletteRefreshSessions"),
        group: tr("paletteGroupCommands"),
        keywords: ["reload", "list"],
        run: () => void workspaceActions.loadSessions(path),
      },
      {
        id: "source-control",
        title: tr("paletteSourceControl"),
        group: tr("paletteGroupCommands"),
        keywords: ["git", "diff", "branch", "status"],
        run: () => setSourceControlTarget(path),
      },
      {
        id: "worktrees",
        title: tr("paletteWorktrees"),
        group: tr("paletteGroupCommands"),
        keywords: ["git", "checkout"],
        run: () => setWorktreesTarget(path),
      },
      {
        id: "project",
        title: tr("paletteProject"),
        group: tr("paletteGroupCommands"),
        keywords: ["instructions", "agents", "git"],
        run: () => setProjectTarget(path),
      },
      {
        id: "services",
        title: tr("paletteServices"),
        group: tr("paletteGroupCommands"),
        keywords: ["web", "search", "image"],
        run: () => setServicesTarget(path),
      },
      {
        id: "core",
        title: tr("paletteCore"),
        group: tr("paletteGroupCommands"),
        keywords: ["health", "config", "agents"],
        run: () => setCoreTarget(path),
      },
      {
        id: "core-models",
        title: tr("paletteCoreModels"),
        group: tr("paletteGroupCommands"),
        keywords: ["catalog", "providers"],
        run: () => setCoreModelsTarget(path),
      },
      {
        id: "mcp",
        title: tr("paletteMcp"),
        group: tr("paletteGroupCommands"),
        keybind: "mod+;",
        keywords: ["tools", "resources", "servers"],
        run: () => setMCPTarget(path),
      },
      {
        id: "plugins",
        title: tr("palettePlugins"),
        group: tr("paletteGroupCommands"),
        keywords: ["tools", "hooks", "commands"],
        run: () => setPluginsTarget(path),
      },
      {
        id: "schedules",
        title: tr("paletteSchedulesOverview"),
        group: tr("paletteGroupCommands"),
        keywords: ["cron", "automation"],
        run: () => setSchedulesOverviewTarget(path),
      },
      {
        id: "jobs",
        title: tr("paletteJobsOverview"),
        group: tr("paletteGroupCommands"),
        keywords: ["tasks", "shell"],
        run: () => setJobsOverviewTarget(path),
      },
      {
        id: "usage",
        title: tr("paletteUsageOverview"),
        group: tr("paletteGroupCommands"),
        keywords: ["tokens", "cost"],
        run: () => setUsageOverviewTarget(path),
      },
      {
        id: "live-events",
        title: tr("paletteLiveEvents"),
        group: tr("paletteGroupCommands"),
        keywords: ["stream", "log"],
        run: () => setLiveEventsTarget(path),
      },
      {
        id: "web-search",
        title: tr("paletteWebSearch"),
        group: tr("paletteGroupCommands"),
        keywords: ["internet", "query"],
        run: () => setWebSearchTarget(path),
      },
      {
        id: "image-generation",
        title: tr("paletteImageGeneration"),
        group: tr("paletteGroupCommands"),
        keywords: ["picture", "prompt"],
        run: () => setImageGenTarget(path),
      },
      {
        id: "formatters",
        title: tr("paletteFormatters"),
        group: tr("paletteGroupCommands"),
        keywords: ["format", "files"],
        run: () => setFormattersTarget(path),
      },
      {
        id: "oauth",
        title: tr("paletteOauth"),
        group: tr("paletteGroupCommands"),
        keywords: ["auth", "tokens"],
        run: () => setOAuthTarget(path),
      },
      {
        id: "import-session",
        title: tr("paletteImportSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["transfer", "json"],
        run: () => setTransferTarget({ workspace: path }),
      },
    );
  }

  if (paletteTarget) {
    const target = paletteTarget;
    paletteCommands.push(
      {
        id: "share-session",
        title: tr("paletteShareSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["link", "url"],
        run: () => setShareTarget(target),
      },
      {
        id: "revert-session",
        title: tr("paletteRevertSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["undo", "snapshot"],
        run: () => setRevertTarget(target),
      },
      {
        id: "compact-session",
        title: tr("paletteCompactSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["summarize", "context"],
        run: () => void compactSession(target),
      },
      {
        id: "session-summary",
        title: tr("paletteSummarizeSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["summary", "recap", "pull request"],
        run: () => void openSummary(target),
      },
      {
        id: "export-session",
        title: tr("paletteExportSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["markdown", "json", "bundle"],
        run: () => setTransferTarget(target),
      },
      {
        id: "session-context",
        title: tr("paletteSessionContext"),
        group: tr("paletteGroupCommands"),
        keywords: ["tokens", "messages"],
        run: () => openSidePanel("details"),
      },
      {
        id: "session-log",
        title: tr("paletteSessionLog"),
        group: tr("paletteGroupCommands"),
        keywords: ["events", "history"],
        run: () => setLogTarget(target),
      },
      {
        id: "session-usage",
        title: tr("paletteSessionUsage"),
        group: tr("paletteGroupCommands"),
        keywords: ["tokens", "cost"],
        run: () => setUsageTarget(target),
      },
      {
        id: "session-inbox",
        title: tr("paletteSessionInbox"),
        group: tr("paletteGroupCommands"),
        keywords: ["queue", "messages"],
        run: () => setInboxTarget(target),
      },
      {
        id: "session-forms",
        title: tr("paletteSessionForms"),
        group: tr("paletteGroupCommands"),
        keywords: ["input", "questions"],
        run: () => setFormsTarget(target),
      },
      {
        id: "session-jobs",
        title: tr("paletteSessionJobs"),
        group: tr("paletteGroupCommands"),
        keywords: ["tasks", "shell"],
        run: () => setJobsTarget(target),
      },
      {
        id: "session-skills",
        title: tr("paletteSessionSkills"),
        group: tr("paletteGroupCommands"),
        keywords: ["instructions", "loader"],
        run: () => setSkillsTarget(target),
      },      {
        id: "session-pairing",
        title: tr("palettePairing"),
        group: tr("paletteGroupCommands"),
        keywords: ["qr", "code"],
        run: () => setPairingTarget(target),
      },
      {
        id: "session-media",
        title: tr("paletteSessionMedia"),
        group: tr("paletteGroupCommands"),
        keywords: ["images", "pdf"],
        run: () => setMediaTarget(target),
      },
      {
        id: "session-references",
        title: tr("paletteSessionReferences"),
        group: tr("paletteGroupCommands"),
        keywords: ["search", "files"],
        run: () => setReferencesTarget(target),
      },
      {
        id: "session-environment",
        title: tr("paletteSessionEnvironment"),
        group: tr("paletteGroupCommands"),
        keywords: ["workdir", "runtime"],
        run: () => setEnvironmentTarget(target),
      },
      {
        id: "session-command",
        title: tr("paletteSessionCommand"),
        group: tr("paletteGroupCommands"),
        keywords: ["slash", "command"],
        run: () => setRunCommandTarget(target),
      },
      {
        id: "session-prompt-once",
        title: tr("palettePromptOnce"),
        group: tr("paletteGroupCommands"),
        keywords: ["message", "once"],
        run: () => setPromptOnceTarget(target),
      },
      {
        id: "session-synthetic",
        title: tr("paletteSynthetic"),
        group: tr("paletteGroupCommands"),
        keywords: ["event", "message"],
        run: () => setSyntheticTarget(target),
      },
      {
        id: "session-wait",
        title: tr("paletteWait"),
        group: tr("paletteGroupCommands"),
        keywords: ["block", "running"],
        run: () => setWaitTarget(target),
      },
    );
  }

  if (paletteSession && activeWorkspace) {
    const path = activeWorkspace.path;
    const session = paletteSession;
    const lastUserText = [...(active?.entries ?? [])]
      .reverse()
      .find((entry) => entry.role === "user" && entry.text)?.text;
    paletteCommands.push(
      {
        id: "rename-session",
        title: tr("paletteRenameSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["title"],
        run: () => setRenameTarget({ workspace: path, session }),
      },
      {
        id: "review-session",
        title: tr("paletteReviewChanges"),
        group: tr("paletteGroupCommands"),
        featured: true,
        keybind: "mod+shift+r",
        keywords: ["diff", "review", "comment"],
        run: () => openSidePanel("review"),
      },
      {
        id: "copy-session-id",
        title: tr("paletteCopySessionID"),
        group: tr("paletteGroupCommands"),
        keywords: ["clipboard", "identifier"],
        run: () => {
          void navigator.clipboard
            .writeText(session.id)
            .then(() => notify(tr("copiedSessionID"), "info"))
            .catch((error) => notify(messageOf(error)));
        },
      },
      {
        id: "previous-message",
        title: tr("palettePreviousMessage"),
        group: tr("paletteGroupCommands"),
        keybind: "mod+alt+[",
        keywords: ["scroll", "user"],
        run: () => navigateMessage(-1),
      },
      {
        id: "next-message",
        title: tr("paletteNextMessage"),
        group: tr("paletteGroupCommands"),
        keybind: "mod+alt+]",
        keywords: ["scroll", "user"],
        run: () => navigateMessage(1),
      },
      {
        id: "fork-session",
        title: tr("paletteForkSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["clone", "branch"],
        run: () => void forkSession(path, session),
      },
      ...(revertCan.undo
        ? [
            {
              id: "undo-session",
              title: tr("paletteUndoMessage"),
              group: tr("paletteGroupCommands"),
              keywords: ["undo", "revert", "snapshot"],
              run: () => void undoLatestTurn(path, session.id, lastUserText).catch((error) => notify(messageOf(error))),
            } satisfies PaletteCommand,
          ]
        : []),
      ...(revertCan.redo
        ? [
            {
              id: "redo-session",
              title: tr("paletteRedoMessage"),
              group: tr("paletteGroupCommands"),
              keywords: ["redo", "reapply", "restore"],
              run: () => void redoLatestTurn(path, session.id).catch((error) => notify(messageOf(error))),
            } satisfies PaletteCommand,
          ]
        : []),
      {
        id: "session-schedules",
        title: tr("paletteSessionSchedules"),
        group: tr("paletteGroupCommands"),
        keywords: ["cron", "automation", "timer"],
        run: () =>
          setSchedulesTarget({
            workspace: path,
            sessionID: session.id,
            title: session.title || session.id,
          }),
      },
      {
        id: "move-session",
        title: tr("paletteMoveSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["transfer"],
        run: () => setMoveTarget({ path, session }),
      },
      {
        id: "delete-session",
        title: tr("paletteDeleteSession"),
        group: tr("paletteGroupCommands"),
        keywords: ["remove"],
        run: () => setDeleteTarget({ workspace: path, session }),
      },
    );
  }

  const paletteSessions = workspaceList
    .flatMap((workspace) =>
      (sessionsByWorkspace[workspace.path] ?? []).map((session) => ({
        workspace,
        session,
      })),
    )
    .sort((left, right) => right.session.updated.localeCompare(left.session.updated))
    .slice(0, 50);
  for (const item of paletteSessions) {
    const key = chatKey(item.workspace.path, item.session.id);
    const working = chats[key]?.running;
    const seen = seenSessions[key];
    paletteCommands.push({
      id: `session:${item.workspace.path}:${item.session.id}`,
      title: item.session.title || item.session.id,
      group: tr("paletteGroupRecent"),
      kind: "session",
      description: item.workspace.name,
      project: item.workspace.name,
      variant: paletteVariant(item.workspace.path),
      meta: relativeTime(item.session.updated),
      status:
        working || (seen !== undefined && key !== activeKey && seen !== item.session.updated)
          ? working
            ? "running"
            : "unread"
          : undefined,
      keywords: ["session", "chat", item.workspace.path],
      run: () => {
        view.showChat();
        workspaceActions.select(item.workspace.path);
        void chatActions.open(item.workspace.path, item.session.id);
      },
    });
  }

  return paletteCommands;
}
