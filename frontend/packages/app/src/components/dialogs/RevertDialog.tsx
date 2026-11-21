import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { History, Undo2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { RevertState } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  /** Preselects the turn whose prompt matches, when opened from one message. */
  initialText?: string;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

/** Stages a revert to one user turn, or reapplies a staged revert. */
export function RevertDialog(props: Props) {
  const [state, setState] = createSignal<RevertState>();
  const [selected, setSelected] = createSignal<number>();
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      const next = await api.revertState(workspace, sessionID);
      setState(next);
      const initialText = props.initialText;
      const matching = initialText
        ? [...next.turns]
            .reverse()
            .find((turn) => turn.hasSnapshot && turn.text.trim() === initialText.trim())
        : undefined;
      update(setSelected, selected, (current) =>
        current && next.turns.some((turn) => turn.seq === current && turn.hasSnapshot)
          ? current
          : matching?.seq ?? next.turns.find((turn) => turn.hasSnapshot)?.seq,
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void props.sessionID;
      void load();
    } else {
      setState(undefined);
      setSelected(undefined);
      setError("");
      setNotice("");
      setBusy(false);
    }
  });

  const revert = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    const seq = selected();
    if (!workspace || !sessionID || seq === undefined) return;
    setBusy(true);
    try {
      const result = await api.revertSession(workspace, sessionID, seq);
      setNotice(`Reverted to turn ${result.turnSeq}`);
      setError("");
      await load();
      props.onChanged?.();
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const reapply = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      const result = await api.reapplySession(workspace, sessionID);
      setNotice(`Reapplied turn ${result.turnSeq}`);
      setError("");
      await load();
      props.onChanged?.();
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const chosen = createMemo(() => state()?.turns.find((turn) => turn.seq === selected()));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <History class="size-4 text-text-faint" />
              Revert
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {state()?.active ? `staged at turn ${state()!.turnSeq}` : `${state()?.turns.length ?? 0} turns`}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} shrink />

        <Show
          when={state()?.active}
          fallback={
            <>
              <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
                <Show
                  when={state() && state()!.turns.length > 0}
                  fallback={
                    <p class="p-3 text-meta text-text-faint">
                      {loading() ? "Loading…" : "No user turns to revert."}
                    </p>
                  }
                >
                  <For each={state()?.turns ?? []}>
                    {(turn) => (
                      <button
                        type="button"
                        disabled={!turn.hasSnapshot}
                        onClick={() => setSelected(turn.seq)}
                        class={`interactive flex w-full items-start gap-2 border-b border-border-base px-3 py-2 text-left last:border-b-0 disabled:opacity-50 ${
                          selected() === turn.seq ? "bg-bg-layer-02" : "hover:bg-bg-layer-01"
                        }`}
                      >
                        <span class="shrink-0 font-mono text-caption text-text-faint">#{turn.seq}</span>
                        <span class="min-w-0 flex-1 whitespace-pre-wrap break-words text-meta text-text-muted">
                          {turn.text || "(no text)"}
                        </span>
                        <span class="shrink-0 text-caption text-text-faint">
                          {turn.hasSnapshot ? "snapshot" : "no snapshot"}
                        </span>
                      </button>
                    )}
                  </For>
                </Show>
              </div>

              <div class="mt-2 flex shrink-0 items-center justify-between gap-2">
                <p class="text-caption text-text-faint">
                  Restores the worktree to the start of the selected turn and hides it and later turns until
                  reapply. Only turns recorded with a snapshot can be reverted.
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy() || !chosen()}
                  onClick={() => void revert()}
                >
                  <History />
                  {busy() ? "Reverting…" : chosen() ? `Revert to #${chosen()!.seq}` : "Revert"}
                </Button>
              </div>
            </>
          }
        >
          <div class="mt-4 rounded-md border border-state-border-warning bg-state-bg-warning px-3 py-2">
            <p class="text-meta leading-5 text-state-fg-warning">
              Turn {state()!.turnSeq} is reverted: files were restored and that turn plus everything after it is
              hidden until you reapply.
            </p>
            <Show when={state()?.files && state()!.files!.length > 0}>
              <ul class="mt-1 max-h-32 overflow-auto font-mono text-caption text-state-fg-warning select-text">
                <For each={state()?.files ?? []}>
                  {(file) => <li class="truncate">{file}</li>}
                </For>
              </ul>
            </Show>
            <Button type="button" size="sm" class="mt-2" disabled={busy()} onClick={() => void reapply()}>
              <Undo2 />
              {busy() ? "Reapplying…" : "Reapply"}
            </Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
