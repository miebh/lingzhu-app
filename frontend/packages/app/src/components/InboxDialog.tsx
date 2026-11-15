import { useEffect, useState } from "react";
import { Inbox, Save, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { inboxExportName, serializeInbox } from "../lib/inboxExport";
import type { InboxItem } from "@lingzhu/ui/types";
import { formatTimeOfDay } from "@lingzhu/ui/format";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Pending steering/queue input of one session. */
export function InboxDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async (quiet = false) => {
    if (!workspace || !sessionID) return;
    if (!quiet) setLoading(true);
    try {
      setItems(await api.inbox(workspace, sessionID));
      if (!quiet) setError("");
    } catch (err) {
      if (!quiet) setError(messageOf(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setItems([]);
      setError("");
      setSaving(false);
      setNotice("");
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(true), 3_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const saveInbox = async () => {
    if (!sessionID || items.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        inboxExportName(sessionID, items.length),
        serializeInbox({ sessionId: sessionID, items }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: InboxItem) => {
    if (!workspace || !sessionID) return;
    const delivery = item.delivery === "queue" ? "steer" : "queue";
    try {
      await api.updateInbox(workspace, sessionID, item.id, delivery);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, delivery } : entry)),
      );
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const cancel = async (item: InboxItem) => {
    if (!workspace || !sessionID) return;
    try {
      await api.cancelInbox(workspace, sessionID, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="size-4 text-text-faint" />
              Inbox
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {items.length} pending input{items.length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || items.length === 0}
              onClick={() => void saveInbox()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} mono />

        <div className="mt-4 max-h-96 overflow-auto rounded-md border border-border-base">
          {items.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No pending input for this session."}
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-meta text-text-muted select-text">
                    {item.payload.text}
                  </p>
                  <p className="mt-1 text-caption text-text-faint">
                    {item.id} · {formatTimeOfDay(item.time.created)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  title={tr("inboxToggleDeliveryMode")}
                  onClick={() => void toggle(item)}
                >
                  {item.delivery === "queue" ? "Queue" : "Steer"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label={`Cancel ${item.id}`}
                  onClick={() => void cancel(item)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>

        <p className="mt-2 text-caption text-text-faint">
          Steer injects at the next model boundary; Queue starts a new turn after this one ends.
        </p>
      </DialogContent>
    </Dialog>
  );
}
