import { Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js";
import { Messages } from "@lingzhu/session-ui/Messages";
import type { ShellOutputSource } from "@lingzhu/session-ui/ToolPart";
import type { ToolRun } from "@lingzhu/ui/types";
import { api } from "../../../lib/api";
import { pendingEntries } from "../../../lib/pending";
import { useShell } from "../../ShellProvider";
import { useActiveChat } from "../../hooks";
import { useRevert } from "../../useRevert";

/** Timeline surface; the floating composer dock owns requests, activity and queue. */
export function MessagesPane(props: { bottomInset?: number; header?: JSX.Element }) {
  const shell = useShell();
  const active = useActiveChat();
  const workspacePath = createMemo(() => shell.activeWorkspace?.path);
  const activeId = createMemo(() => active()?.id);
  const isDraft = createMemo(() => Boolean(active()?.draft));
  const sessionID = createMemo(() => {
    const chat = active();
    return chat && !chat.draft ? chat.id : undefined;
  });
  const revert = useRevert({
    workspace: workspacePath,
    sessionID: activeId,
    entryCount: () => active()?.entries.length ?? 0,
    restorePrompt: shell.restoreText,
  });

  // Background subagents outlive their launch call; keep their timeline card
  // spinning while the child session is still running.
  const [runningSubagents, setRunningSubagents] = createSignal<ReadonlySet<string>>(new Set<string>());
  createEffect(() => {
    const path = workspacePath();
    const id = sessionID();
    if (!path || !id) {
      setRunningSubagents(new Set<string>());
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const children = await api.sessionSubagents(path, id);
        if (!cancelled) setRunningSubagents(new Set(children.map((child) => child.id)));
      } catch {
        // The activity chips own their own error state; a missing card spinner is harmless.
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 3000);
    onCleanup(() => {
      cancelled = true;
      window.clearInterval(timer);
    });
  });

  const onReview = () => shell.panel.openSidePanel("review");
  const onOpenFile = (path: string) => shell.panel.openFileInPanel(path);
  const onOpenSession = (childID: string) => {
    const path = workspacePath();
    if (!path) return;
    shell.workspaceActions.select(path);
    void shell.chatActions.open(path, childID);
  };
  const onUndo = (text: string) => {
    const path = workspacePath();
    const id = activeId();
    if (!path || !id) return;
    void revert.undoLatestTurn(path, id, text);
  };
  const onRevert = (text: string, created?: string) => {
    const path = workspacePath();
    const id = activeId();
    if (!path || !id) return;
    void revert.revertToMessage(path, id, text, created);
  };
  const onFork = (text: string) => {
    const path = workspacePath();
    const id = activeId();
    if (!path || !id) return;
    void shell.sessionActions.forkMessage(path, id, text);
  };
  const onLoadOlder = () => {
    const path = workspacePath();
    const id = activeId();
    if (!path || !id || isDraft()) return;
    shell.chatActions.loadOlder(path, id);
  };
  const shellOutput = (tool: ToolRun): ShellOutputSource | undefined => {
    const id = typeof tool.metadata?.shellID === "string" ? tool.metadata.shellID : "";
    const path = workspacePath();
    if (!id || !path) return undefined;
    const running = tool.metadata?.background === true && !tool.done;
    return {
      id,
      running,
      load: async (shellID: string, cursor: number) => {
        const page = await api.shellOutput(path, shellID, cursor, 64 * 1024);
        return { output: page.output, cursor: page.cursor, truncated: page.truncated };
      },
    };
  };
  const modelLabel = createMemo(() => shell.modelDisplayName(active()?.provider, active()?.model));
  const closeMissing = () => {
    const path = workspacePath();
    const id = activeId();
    if (!path || !id) return;
    shell.tabs.removeSessionTabs([{ path, id }]);
  };

  // Pending steering input comes from the durable inbox projection, so it
  // renders before delivery and disappears in the same update that appends
  // the delivered message.
  const pending = createMemo(() => {
    const chat = active();
    return chat ? pendingEntries(chat.inbox, chat) : [];
  });
  const chat = createMemo(() => {
    const current = active();
    if (!current) return undefined;
    const queued = pending();
    return queued.length > 0 ? { ...current, entries: [...current.entries, ...queued] } : current;
  });

  return (
    <Show when={chat()}>
      {(current) => (
        <Messages
          chat={current()}
          workspace={workspacePath()}
          runningSubagents={runningSubagents()}
          header={props.header}
          foldLongMessages={shell.preferences.foldUserMessages}
          showTurnDiffs={shell.preferences.showTurnDiffs}
          showAgent={shell.preferences.showMessageAgent}
          modelLabel={modelLabel()}
          modelName={shell.modelDisplayName}
          onReview={onReview}
          onOpenFile={onOpenFile}
          onOpenSession={onOpenSession}
          onQuote={shell.quoteMessage}
          onUndo={workspacePath() ? onUndo : undefined}
          onRevert={workspacePath() ? onRevert : undefined}
          onFork={workspacePath() ? onFork : undefined}
          canUndo={revert.revertCan().undo}
          detail={shell.preferences.appearance.timelineDetail}
          bottomInset={props.bottomInset}
          onLoadOlder={workspacePath() && activeId() && !isDraft() ? onLoadOlder : undefined}
          shellOutput={shellOutput}
          onCloseMissing={closeMissing}
        />
      )}
    </Show>
  );
}
