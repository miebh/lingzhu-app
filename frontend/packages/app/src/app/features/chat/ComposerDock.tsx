import { For, Show, createMemo, onCleanup } from "solid-js";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { capitalize } from "@lingzhu/ui/text";
import { formatDuration } from "@lingzhu/ui/format";
import { useT } from "@lingzhu/ui/i18n";
import { ComposerPane } from "./ComposerPane";
import { GoalPill } from "../../../components/session/GoalPill";
import { PermissionCard } from "../../../components/session/PermissionCard";
import { QuestionCard } from "../../../components/session/QuestionCard";
import { SessionActivityChips } from "../../../components/session/SessionActivityChips";
import { SessionQueuePanel } from "../../../components/session/SessionQueuePanel";
import { useShell } from "../../ShellProvider";
import { useActiveChat } from "../../hooks";
import { useInbox } from "../../useInbox";

/**
 * The floating session dock: background work, the goal pill, queued prompts
 * and the composer (or the request that replaces it). It overlays the timeline
 * and reports its height so the transcript can reserve a bottom inset.
 */
export function ComposerDock(props: {
  onInset: (height: number) => void;
  /** Child sessions show a subagent bar instead of the composer. */
  child?: { title: string; parent?: { id: string; title: string }; running: boolean; onBack: () => void };
}) {
  const shell = useShell();
  const active = useActiveChat();
  const inbox = useInbox({
    workspace: () => shell.activeWorkspace?.path,
    sessionID: () => {
      const chat = active();
      return chat && !chat.draft ? chat.id : undefined;
    },
    restorePrompt: shell.restoreText,
  });
  const t = useT();

  let element: HTMLDivElement | undefined;
  let observer: ResizeObserver | undefined;
  const measure = () => {
    if (element) props.onInset(Math.ceil(element.getBoundingClientRect().height));
  };
  const attach = (node: HTMLDivElement) => {
    observer?.disconnect();
    element = node;
    observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
  };
  onCleanup(() => observer?.disconnect());

  // `off` hides the chips, so the alignment the component receives is always a
  // real side.
  const activityAlign = createMemo(() => {
    const value = shell.preferences.backgroundActivity;
    return value === "off" ? undefined : value;
  });

  const queue = createMemo(() =>
    inbox.inbox().filter((item) => item.type === "user" && item.delivery === "queue"),
  );

  return (
    <Show when={active()}>
      {(chat) => (
        <div ref={attach} class="flex w-full flex-col">
          <Show
            when={props.child}
            fallback={
              <>
                <Show when={activityAlign()}>
                  {(align) => (
                    <SessionActivityChips
                      workspace={shell.activeWorkspace?.path}
                      sessionID={chat().id}
                      align={align()}
                      onOpenSubagent={(sessionID) => {
                        const workspace = shell.activeWorkspace;
                        if (!workspace) return;
                        shell.workspaceActions.select(workspace.path);
                        void shell.chatActions.open(workspace.path, sessionID);
                      }}
                    />
                  )}
                </Show>

                <Show when={shell.activeWorkspace}>
                  {(workspace) => (
                    <div class="mx-auto flex w-full max-w-session items-center gap-2 px-3 pb-2">
                      <GoalPill workspace={workspace().path} sessionID={chat().id} />
                    </div>
                  )}
                </Show>

                <SessionQueuePanel
                  items={queue()}
                  onRemove={(id) => void inbox.removeInboxItem(id)}
                  onToggleDelivery={(item) => void inbox.toggleInboxDelivery(item)}
                  onEdit={(item) => void inbox.editInboxItem(item)}
                />

                <Show
                  when={chat().questions.length > 0}
                  fallback={
                    <Show when={chat().pending.length > 0} fallback={<ComposerPane />}>
                      <PermissionCard
                        requests={chat().pending}
                        onReply={(id, decision, message) =>
                          void shell.chatActions.reply(id, decision, message)
                        }
                      />
                    </Show>
                  }
                >
                  <QuestionCard
                    requests={chat().questions}
                    onReply={(id, response) => void shell.chatActions.answerQuestion(id, response)}
                  />
                </Show>
              </>
            }
          >
            {(child) => {
              const status = () =>
                child().running
                  ? "Running"
                  : chat().lastRunStatus === "failed"
                    ? "Failed"
                    : chat().lastRunStatus === "stopped"
                      ? "Interrupted"
                      : "Finished";
              const elapsed = () => (child().running ? chat().runStartedAt : undefined);
              const meta = () => {
                const startedAt = elapsed();
                return [
                  status(),
                  startedAt === undefined ? "" : formatDuration(Date.now() - startedAt),
                  chat().agent ? capitalize(chat().agent!) : "",
                  chat().model || "",
                ].filter(Boolean);
              };

              return (
                <div
                  data-component="subagent-bar"
                  class="relative flex h-8 w-full min-w-0 items-center gap-2 bg-bg-base ps-3 pe-1.5 text-[12px] font-[440] leading-4 tracking-[-0.04px] whitespace-nowrap tabular-nums text-text-faint before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-[linear-gradient(to_top,var(--bg-base),transparent)]"
                >
                  <Show when={child().running}>
                    <ActivityRing size={16} />
                  </Show>
                  <div class="flex min-w-0 flex-1 items-center gap-1.5">
                    <For each={meta()}>
                      {(item, index) => (
                        <span class="flex min-w-0 items-center gap-1.5">
                          <Show when={index() > 0}>
                            <span aria-hidden="true">·</span>
                          </Show>
                          <span class="truncate">{item}</span>
                        </span>
                      )}
                    </For>
                  </div>
                  <button
                    type="button"
                    onClick={() => child().onBack()}
                    class="interactive shrink-0 rounded-xs px-1.5 text-caption text-text-muted hover:text-text-base"
                  >
                    {t("subagentBack")}
                  </button>
                </div>
              );
            }}
          </Show>
        </div>
      )}
    </Show>
  );
}
