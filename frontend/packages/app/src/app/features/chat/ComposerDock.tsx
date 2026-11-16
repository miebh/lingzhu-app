import { useEffect, useRef } from "react";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { capitalize } from "@lingzhu/ui/text";
import { formatDuration } from "@lingzhu/ui/format";
import { useT } from "@lingzhu/ui/i18n";
import { ComposerPane } from "./ComposerPane";
import { GoalPill } from "../../../components/GoalPill";
import { PermissionCard } from "../../../components/PermissionCard";
import { QuestionCard } from "../../../components/QuestionCard";
import { SessionActivityChips } from "../../../components/SessionActivityChips";
import { SessionQueuePanel } from "../../../components/SessionQueuePanel";
import { useShell } from "../../ShellProvider";
import { useActiveChat } from "../../hooks";
import { useInbox } from "../../useInbox";

/**
 * The floating session dock: background work, the goal pill, queued prompts
 * and the composer (or the request that replaces it). It overlays the timeline
 * and reports its height so the transcript can reserve a bottom inset.
 */
export function ComposerDock({
  onInset,
  child,
}: {
  onInset: (height: number) => void;
  /** Child sessions show a subagent bar instead of the composer. */
  child?: { title: string; parent?: { id: string; title: string }; running: boolean; onBack: () => void };
}) {
  const shell = useShell();
  const { activeWorkspace, preferences, chatActions } = shell;
  const active = useActiveChat();
  const inbox = useInbox({
    workspace: activeWorkspace?.path,
    sessionID: active && !active.draft ? active.id : undefined,
    restorePrompt: shell.restoreText,
  });
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => onInset(Math.ceil(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onInset]);

  if (!active) return null;

  const question = active.questions[0];

  if (child) {
    const status = child.running
      ? "Running"
      : active.lastRunStatus === "failed"
        ? "Failed"
        : active.lastRunStatus === "stopped"
          ? "Interrupted"
          : "Finished";
    const elapsed = child.running ? active.runStartedAt : undefined;
    const meta = [
      status,
      elapsed === undefined ? "" : formatDuration(Date.now() - elapsed),
      active.agent ? capitalize(active.agent) : "",
      active.model || "",
    ].filter(Boolean);
    return (
      <div ref={ref} className="flex w-full flex-col">
        <div
          data-component="subagent-bar"
          className="relative flex h-8 w-full min-w-0 items-center gap-2 bg-bg-base ps-3 pe-1.5 text-[12px] font-[440] leading-4 tracking-[-0.04px] whitespace-nowrap tabular-nums text-text-faint before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-[linear-gradient(to_top,var(--bg-base),transparent)]"
        >
          {child.running ? <ActivityRing size={16} /> : null}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {meta.map((item, index) => (
              <span key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <span aria-hidden="true">·</span>}
                <span className="truncate">{item}</span>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={child.onBack}
            className="interactive shrink-0 rounded-xs px-1.5 text-caption text-text-muted hover:text-text-base"
          >
            {t("subagentBack")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex w-full flex-col">
      {preferences.backgroundActivity !== "off" && (
        <SessionActivityChips
          workspace={activeWorkspace?.path}
          sessionID={active.id}
          align={preferences.backgroundActivity}
          onOpenSubagent={(sessionID) => {
            if (!activeWorkspace) return;
            shell.workspaceActions.select(activeWorkspace.path);
            void chatActions.open(activeWorkspace.path, sessionID);
          }}
        />
      )}

      {activeWorkspace && (
        <div className="mx-auto flex w-full max-w-session items-center gap-2 px-3 pb-2">
          <GoalPill workspace={activeWorkspace.path} sessionID={active.id} />
        </div>
      )}

      <SessionQueuePanel
        items={inbox.inbox.filter((item) => item.type === "user" && item.delivery === "queue")}
        onRemove={(id) => void inbox.removeInboxItem(id)}
        onToggleDelivery={(item) => void inbox.toggleInboxDelivery(item)}
        onEdit={(item) => void inbox.editInboxItem(item)}
      />

      {question ? (
        <QuestionCard
          requests={active.questions}
          onReply={(id, response) => void chatActions.answerQuestion(id, response)}
        />
      ) : active.pending.length > 0 ? (
        <PermissionCard
          requests={active.pending}
          onReply={(id, decision, message) => void chatActions.reply(id, decision, message)}
        />
      ) : (
        <ComposerPane />
      )}
    </div>
  );
}
