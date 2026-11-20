import { useEffect, useState } from "react";
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
export function RevertDialog({ open, workspace, sessionID, title, initialText, onOpenChange, onChanged }: Props) {
  const [state, setState] = useState<RevertState>();
  const [selected, setSelected] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      const next = await api.revertState(workspace, sessionID);
      setState(next);
      const matching = initialText
        ? [...next.turns]
            .reverse()
            .find((turn) => turn.hasSnapshot && turn.text.trim() === initialText.trim())
        : undefined;
      setSelected((current) =>
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

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setState(undefined);
      setSelected(undefined);
      setError("");
      setNotice("");
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const revert = async () => {
    if (!workspace || !sessionID || selected === undefined) return;
    setBusy(true);
    try {
      const result = await api.revertSession(workspace, sessionID, selected);
      setNotice(`Reverted to turn ${result.turnSeq}`);
      setError("");
      await load();
      onChanged?.();
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const reapply = async () => {
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      const result = await api.reapplySession(workspace, sessionID);
      setNotice(`Reapplied turn ${result.turnSeq}`);
      setError("");
      await load();
      onChanged?.();
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const chosen = state?.turns.find((turn) => turn.seq === selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4 text-text-faint" />
              Revert
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {state?.active ? `staged at turn ${state.turnSeq}` : `${state?.turns.length ?? 0} turns`}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

        {state?.active ? (
          <div className="mt-4 rounded-md border border-state-border-warning bg-state-bg-warning px-3 py-2">
            <p className="text-meta leading-5 text-state-fg-warning">
              Turn {state.turnSeq} is reverted: files were restored and that turn plus everything after it is
              hidden until you reapply.
            </p>
            {state.files && state.files.length > 0 && (
              <ul className="mt-1 max-h-32 overflow-auto font-mono text-caption text-state-fg-warning select-text">
                {state.files.map((file) => (
                  <li key={file} className="truncate">
                    {file}
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void reapply()}>
              <Undo2 />
              {busy ? "Reapplying…" : "Reapply"}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
              {!state || state.turns.length === 0 ? (
                <p className="p-3 text-meta text-text-faint">
                  {loading ? "Loading…" : "No user turns to revert."}
                </p>
              ) : (
                state.turns.map((turn) => (
                  <button
                    key={turn.seq}
                    type="button"
                    disabled={!turn.hasSnapshot}
                    onClick={() => setSelected(turn.seq)}
                    className={`interactive flex w-full items-start gap-2 border-b border-border-base px-3 py-2 text-left last:border-b-0 disabled:opacity-50 ${
                      selected === turn.seq ? "bg-bg-layer-02" : "hover:bg-bg-layer-01"
                    }`}
                  >
                    <span className="shrink-0 font-mono text-caption text-text-faint">#{turn.seq}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-meta text-text-muted">
                      {turn.text || "(no text)"}
                    </span>
                    <span className="shrink-0 text-caption text-text-faint">
                      {turn.hasSnapshot ? "snapshot" : "no snapshot"}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
              <p className="text-caption text-text-faint">
                Restores the worktree to the start of the selected turn and hides it and later turns until
                reapply. Only turns recorded with a snapshot can be reverted.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={busy || !chosen}
                onClick={() => void revert()}
              >
                <History />
                {busy ? "Reverting…" : chosen ? `Revert to #${chosen.seq}` : "Revert"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
