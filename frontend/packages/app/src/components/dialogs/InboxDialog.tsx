import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Inbox, Save, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { inboxExportName, serializeInbox } from "../../lib/inboxExport";
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
export function InboxDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<InboxItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async (quiet = false) => {
    if (!props.workspace || !props.sessionID) return;
    if (!quiet) setLoading(true);
    try {
      setItems(await api.inbox(props.workspace, props.sessionID));
      if (!quiet) setError("");
    } catch (err) {
      if (!quiet) setError(messageOf(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  createEffect(() => {
    if (!props.open) {
      setItems([]);
      setError("");
      setSaving(false);
      setNotice("");
      return;
    }
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    void load();
    const timer = window.setInterval(() => void load(true), 3_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const saveInbox = async () => {
    const sessionID = props.sessionID;
    if (!sessionID || items().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        inboxExportName(sessionID, items().length),
        serializeInbox({ sessionId: sessionID, items: items() }),
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
    if (!props.workspace || !props.sessionID) return;
    const delivery = item.delivery === "queue" ? "steer" : "queue";
    try {
      await api.updateInbox(props.workspace, props.sessionID, item.id, delivery);
      update(setItems, items, (current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, delivery } : entry)),
      );
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const cancel = async (item: InboxItem) => {
    if (!props.workspace || !props.sessionID) return;
    try {
      await api.cancelInbox(props.workspace, props.sessionID, item.id);
      update(setItems, items, (current) => current.filter((entry) => entry.id !== item.id));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Inbox class="size-4 text-text-faint" />
              Inbox
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {items().length} pending input{items().length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || items().length === 0}
              onClick={() => void saveInbox()}
            >
              <Save />
              {saving() ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <div class="mt-4 max-h-96 overflow-auto rounded-md border border-border-base">
          <Show
            when={items().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? "Loading…" : "No pending input for this session."}
              </p>
            }
          >
            <For each={items()}>
              {(item) => (
                <div class="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                  <div class="min-w-0 flex-1">
                    <p class="whitespace-pre-wrap break-words text-meta text-text-muted select-text">
                      {item.payload.text}
                    </p>
                    <p class="mt-1 text-caption text-text-faint">
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
              )}
            </For>
          </Show>
        </div>

        <p class="mt-2 text-caption text-text-faint">
          Steer injects at the next model boundary; Queue starts a new turn after this one ends.
        </p>
      </DialogContent>
    </Dialog>
  );
}
