import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Messages } from "@lingzhu/session-ui/Messages";
import type { ShellOutputSource } from "@lingzhu/session-ui/ToolPart";
import type { ToolRun } from "@lingzhu/ui/types";
import { api } from "../../../lib/api";
import { useShell } from "../../ShellProvider";
import { useActiveChat } from "../../hooks";
import { useRevert } from "../../useRevert";

/** Timeline surface; the floating composer dock owns requests, activity and queue. */
export function MessagesPane({ bottomInset = 0, header }: { bottomInset?: number; header?: ReactNode }) {
  const shell = useShell();
  const { activeWorkspace, preferences, workspaceActions, chatActions, panel } = shell;
  const active = useActiveChat();
  const revert = useRevert({
    workspace: activeWorkspace?.path,
    sessionID: active?.id,
    entryCount: active?.entries.length ?? 0,
    restorePrompt: shell.restoreText,
  });

  // Background subagents outlive their launch call; keep their timeline card
  // spinning while the child session is still running.
  const [runningSubagents, setRunningSubagents] = useState<ReadonlySet<string>>(() => new Set());
  const workspacePath = activeWorkspace?.path;
  const sessionID = active && !active.draft ? active.id : undefined;
  useEffect(() => {
    if (!workspacePath || !sessionID) {
      setRunningSubagents(new Set());
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const children = await api.sessionSubagents(workspacePath, sessionID);
        if (!cancelled) setRunningSubagents(new Set(children.map((child) => child.id)));
      } catch {
        // The activity chips own their own error state; a missing card spinner is harmless.
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspacePath, sessionID]);

  // The transcript is memoized on its props, so every callback handed to it has
  // to keep its identity across a streamed token; a fresh closure would make
  // the whole timeline re-render for text that changed in one row.
  const activeWorkspacePath = activeWorkspace?.path;
  const activeId = active?.id;
  const isDraft = Boolean(active?.draft);
  const openSidePanel = panel.openSidePanel;
  const openFileInPanel = panel.openFileInPanel;
  const selectWorkspace = workspaceActions.select;
  const openChat = chatActions.open;
  const loadOlder = chatActions.loadOlder;
  const forkMessage = shell.sessionActions.forkMessage;
  const quoteMessage = shell.quoteMessage;
  const undoLatestTurn = revert.undoLatestTurn;
  const revertToMessage = revert.revertToMessage;
  const modelName = shell.modelDisplayName;
  const provider = active?.provider;
  const model = active?.model;
  const canUndo = revert.revertCan.undo;

  const onReview = useCallback(() => openSidePanel("review"), [openSidePanel]);
  const onOpenFile = useCallback((path: string) => openFileInPanel(path), [openFileInPanel]);
  const onOpenSession = useCallback(
    (childID: string) => {
      if (!activeWorkspacePath) return;
      selectWorkspace(activeWorkspacePath);
      void openChat(activeWorkspacePath, childID);
    },
    [activeWorkspacePath, selectWorkspace, openChat],
  );
  const onUndo = useCallback(
    (text: string) => {
      if (!activeWorkspacePath || !activeId) return;
      void undoLatestTurn(activeWorkspacePath, activeId, text);
    },
    [activeWorkspacePath, activeId, undoLatestTurn],
  );
  const onRevert = useCallback(
    (text: string, created?: string) => {
      if (!activeWorkspacePath || !activeId) return;
      void revertToMessage(activeWorkspacePath, activeId, text, created);
    },
    [activeWorkspacePath, activeId, revertToMessage],
  );
  const onFork = useCallback(
    (text: string) => {
      if (!activeWorkspacePath || !activeId) return;
      void forkMessage(activeWorkspacePath, activeId, text);
    },
    [activeWorkspacePath, activeId, forkMessage],
  );
  const onLoadOlder = useMemo(
    () =>
      activeWorkspacePath && activeId && !isDraft
        ? () => loadOlder(activeWorkspacePath, activeId)
        : undefined,
    [activeWorkspacePath, activeId, isDraft, loadOlder],
  );
  const shellOutput = useMemo<((tool: ToolRun) => ShellOutputSource | undefined) | undefined>(
    () => (tool: ToolRun) => {
      const id = typeof tool.metadata?.shellID === "string" ? tool.metadata.shellID : "";
      if (!id || !activeWorkspacePath) return undefined;
      const running = tool.metadata?.background === true && !tool.done;
      return {
        id,
        running,
        load: async (shellID: string, cursor: number) => {
          const page = await api.shellOutput(activeWorkspacePath, shellID, cursor, 64 * 1024);
          return { output: page.output, cursor: page.cursor, truncated: page.truncated };
        },
      };
    },
    [activeWorkspacePath],
  );
  const modelLabel = useMemo(() => modelName(provider, model), [modelName, provider, model]);
  const closeMissing = useCallback(() => {
    if (!activeWorkspacePath || !activeId) return;
    shell.tabs.removeSessionTabs([{ path: activeWorkspacePath, id: activeId }]);
  }, [shell.tabs, activeWorkspacePath, activeId]);

  if (!active) return null;

  return (
    <>
      <Messages
        chat={active}
        workspace={activeWorkspacePath}
        runningSubagents={runningSubagents}
        header={header}
        foldLongMessages={preferences.foldUserMessages}
        showTurnDiffs={preferences.showTurnDiffs}
        showAgent={preferences.showMessageAgent}
        modelLabel={modelLabel}
        modelName={modelName}
        onReview={onReview}
        onOpenFile={onOpenFile}
        onOpenSession={onOpenSession}
        onQuote={quoteMessage}
        onUndo={activeWorkspacePath ? onUndo : undefined}
        onRevert={activeWorkspacePath ? onRevert : undefined}
        onFork={activeWorkspacePath ? onFork : undefined}
        canUndo={canUndo}
        detail={preferences.appearance.timelineDetail}
        bottomInset={bottomInset}
        onLoadOlder={onLoadOlder}
        shellOutput={shellOutput}
        onCloseMissing={closeMissing}
      />
    </>
  );
}
