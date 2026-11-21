import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Button } from "@lingzhu/ui/button";
import { CircleAlert, RefreshCw, Square, Trash2 } from "@lingzhu/ui/icons";
import { api } from "@/lib/api";
import { t, type MessageKey } from "@lingzhu/ui/i18n";

export interface GoalState {
  id: string;
  objective: string;
  status: "active" | "paused" | "complete";
  reason?: string;
  rounds: number;
  maxRounds: number;
}

/**
 * Pill label and tone per status. The reference names the active state "Goal",
 * warns on paused and confirms on met.
 */
const STATUS: Record<GoalState["status"], { label: MessageKey; tone: string }> = {
  active: { label: "goal", tone: "" },
  paused: { label: "goalPaused", tone: "text-state-fg-warning" },
  complete: { label: "goalMet", tone: "text-state-fg-success" },
};

/** Status glyph per state, matching the reference icon set. */
function GoalGlyph(props: { status: GoalState["status"] }) {
  return (
    <Show
      when={props.status !== "paused" && props.status !== "complete"}
      fallback={<CircleAlert class="size-4" />}
    >
      {/* The active state uses a steering glyph in the reference; the app's
          closest ring icon keeps the same silhouette at 16px. */}
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" class="shrink-0">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" />
        <circle cx="8" cy="8" r="1.75" fill="currentColor" />
      </svg>
    </Show>
  );
}

/**
 * GoalPill is the session's goal in the composer lane: a pill showing the
 * status, and a popover headed by the objective with the actions that apply.
 * Creating a goal happens through `/goal <objective>` in the composer.
 */
export function GoalPill(props: { workspace: string; sessionID: string }) {
  const [goal, setGoal] = createSignal<GoalState | null>(null);
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let root: HTMLDivElement | undefined;

  createEffect(() => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    let live = true;
    const load = () => {
      api
        .goalState(workspace, sessionID)
        .then((next) => {
          if (live) setGoal(next);
        })
        .catch(() => {
          if (live) setGoal(null);
        });
    };
    load();
    const tick = () => {
      if (!document.hidden) load();
    };
    const timer = window.setInterval(tick, 4000);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    onCleanup(() => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    });
  });

  createEffect(() => {
    if (!open()) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  const view = createMemo(() => {
    const current = goal();
    return current ? STATUS[current.status] : undefined;
  });

  const run = async (action: "pause" | "resume" | "clear") => {
    setOpen(false);
    setBusy(true);
    try {
      await api.goalAction(props.workspace, props.sessionID, action);
      setGoal(await api.goalState(props.workspace, props.sessionID));
    } catch {
      // A failed action leaves the pill showing the last known state.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={goal()}>
      {(current) => (
        <div ref={root} class="relative shrink-0">
          <button
            type="button"
            data-composer-pill
            data-slot="session-plugin-pill"
            data-status={current().status}
            aria-label={current().objective}
            aria-haspopup="dialog"
            aria-expanded={open()}
            onClick={() => setOpen(!open())}
            class={`flex h-8 min-w-0 max-w-full items-center gap-2 rounded-lg border-[0.5px] border-transparent bg-bg-base px-2.5 text-body font-[440] leading-4 tracking-[-0.04px] whitespace-nowrap text-text-base shadow-elevation-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-[2.5px] focus-visible:outline-border-focus dark:bg-bg-layer-01 ${
              open() ? "bg-bg-layer-01 dark:bg-bg-layer-02" : ""
            }`}
          >
            <span class={`grid shrink-0 place-items-center ${view()?.tone || "text-text-faint"}`}>
              <GoalGlyph status={current().status} />
            </span>
            <span class="min-w-0 max-w-[260px] truncate">{t(view()?.label ?? "goal")}</span>
          </button>

          <Show when={open()}>
            <div
              data-composer-pill-panel
              data-slot="session-plugin-pill-popover"
              aria-label={current().objective}
              class="absolute bottom-10 left-0 z-30 w-80 max-w-[calc(100vw-56px)] rounded-[10px] border-[0.5px] border-transparent bg-bg-layer-01 p-1 shadow-elevation-floating"
            >
              <div class="px-2 pt-1 pb-1.5 text-[11px] leading-4 font-[530] tracking-[0.05px] text-text-faint">
                <span dir="auto" class="line-clamp-3 break-words">
                  {current().objective}
                </span>
              </div>
              <div class="flex justify-end gap-1 px-1 pt-1">
                <Show when={current().status === "active"}>
                  <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void run("pause")}>
                    <Square class="size-3" />
                    {t("pause")}
                  </Button>
                </Show>
                <Show when={current().status === "paused"}>
                  <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void run("resume")}>
                    <RefreshCw class="size-3" />
                    {t("resume")}
                  </Button>
                </Show>
                <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void run("clear")}>
                  <Trash2 class="size-3" />
                  {t("clear")}
                </Button>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
