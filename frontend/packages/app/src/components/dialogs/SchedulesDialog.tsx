import { For, Show, createEffect, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Clock, Pause, Pencil, Play, Plus, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { ScheduleItem, ScheduleWhen } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { scheduleWhenLabel } from "../../lib/schedules";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

type WhenType = "in" | "every" | "at";

/** Lists, creates and deletes schedules owned by one session. */
export function SchedulesDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<ScheduleItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [name, setName] = createSignal("");
  const [prompt, setPrompt] = createSignal("");
  const [type, setType] = createSignal<WhenType>("in");
  const [value, setValue] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [editing, setEditing] = createSignal<string>();
  const [editName, setEditName] = createSignal("");
  const [editPrompt, setEditPrompt] = createSignal("");
  const [editType, setEditType] = createSignal<WhenType>("in");
  const [editValue, setEditValue] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const load = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      setItems(await api.schedules(workspace, sessionID));
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
      setItems([]);
      setError("");
      setName("");
      setPrompt("");
      setType("in");
      setValue("");
      setEditing(undefined);
      setSaving(false);
    }
  });

  const replaceItem = (item: ScheduleItem) => {
    update(setItems, items, (current) => current.map((entry) => (entry.id === item.id ? item : entry)));
  };

  const startEdit = (item: ScheduleItem) => {
    setEditing(item.id);
    setEditName(item.name ?? "");
    setEditPrompt(item.prompt);
    const kind = (item.when.type === "every" || item.when.type === "at" ? item.when.type : "in") as WhenType;
    setEditType(kind);
    setEditValue(
      kind === "every" ? (item.when.every ?? "") : kind === "at" ? (item.when.at ?? "") : (item.when.in ?? ""),
    );
  };

  const editWhen = (): ScheduleWhen => {
    const current = editType();
    switch (current) {
      case "every":
        return { type: "every", every: editValue().trim() };
      case "at":
        return { type: "at", at: editValue().trim() };
      default:
        return { type: "in", in: editValue().trim() };
    }
  };

  const saveEdit = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    const editingID = editing();
    if (!workspace || !sessionID || !editingID) return;
    if (!editPrompt().trim() || !editValue().trim()) {
      setError("Prompt and time are required.");
      return;
    }
    setSaving(true);
    try {
      const item = await api.updateSchedule(workspace, editingID, {
        sessionId: sessionID,
        name: editName().trim(),
        prompt: editPrompt().trim(),
        when: editWhen(),
      });
      replaceItem(item);
      setEditing(undefined);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (item: ScheduleItem) => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    try {
      const updated = await api.updateSchedule(workspace, item.id, {
        sessionId: sessionID,
        action: item.status === "paused" ? "resume" : "pause",
      });
      replaceItem(updated);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const when = (): ScheduleWhen => {
    const current = type();
    switch (current) {
      case "in":
        return { type: "in", in: value().trim() };
      case "every":
        return { type: "every", every: value().trim() };
      default:
        return { type: "at", at: value().trim() };
    }
  };

  const create = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    if (!prompt().trim() || !value().trim()) {
      setError("Prompt and time are required.");
      return;
    }
    setCreating(true);
    try {
      const item = await api.createSchedule(workspace, sessionID, name().trim(), prompt().trim(), when());
      update(setItems, items, (current) => [...current, item]);
      setName("");
      setPrompt("");
      setValue("");
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (item: ScheduleItem) => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    try {
      await api.deleteSchedule(workspace, sessionID, item.id);
      update(setItems, items, (current) => current.filter((entry) => entry.id !== item.id));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>Schedules</DialogTitle>
            <DialogDescription class="truncate">{props.title || props.sessionID}</DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />

        <div class="mt-4 shrink-0 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={name()}
              placeholder={tr("schedulesNameOptional")}
              aria-label={tr("schedulesScheduleName")}
              onInput={(event) => setName(event.currentTarget.value)}
              class="select-text"
            />
            <div class="flex gap-2">
              <select
                value={type()}
                aria-label={tr("schedulesScheduleType")}
                onChange={(event) => {
                  setType(event.currentTarget.value as WhenType);
                  setValue("");
                }}
                class="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
              >
                <option value="in">In</option>
                <option value="every">Every</option>
                <option value="at">At</option>
              </select>
              <Input
                value={value()}
                aria-label={tr("schedulesScheduleTime")}
                type={type() === "at" ? "datetime-local" : "text"}
                placeholder={type() === "every" ? "1h" : type() === "in" ? "10m" : ""}
                onInput={(event) => setValue(event.currentTarget.value)}
                class="select-text"
              />
            </div>
          </div>
          <Textarea
            value={prompt()}
            placeholder={tr("schedulesPromptSentToThisSessionWhenTheScheduleFires")}
            aria-label={tr("schedulesSchedulePrompt")}
            onInput={(event) => setPrompt(event.currentTarget.value)}
            class="mt-2 select-text"
          />
          <div class="mt-2 flex justify-end">
            <Button type="button" size="sm" disabled={creating()} onClick={() => void create()}>
              <Plus />
              {tr("dialogAddSchedule")}
            </Button>
          </div>
        </div>

        <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={items().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? "Loading…" : "No schedules yet."}
              </p>
            }
          >
            <For each={items()}>
              {(item) => (
                <div class="flex items-start gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                  <Clock class="mt-0.5 size-4 shrink-0 text-text-faint" />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="truncate text-body text-text-base">
                        {item.name || item.prompt}
                      </span>
                      <span class="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                        {item.status}
                      </span>
                      <span class="text-caption text-text-faint">{scheduleWhenLabel(item.when)}</span>
                    </div>
                    <Show
                      when={editing() === item.id}
                      fallback={
                        <>
                          <p class="mt-0.5 truncate text-meta text-text-muted" title={item.prompt}>
                            {item.prompt}
                          </p>
                          <p class="mt-0.5 text-caption text-text-faint">
                            {item.nextDueAt ? `Next ${formatDateTime(item.nextDueAt)}` : "No next run"}
                            {item.runCount > 0 ? ` · ${item.runCount} run${item.runCount === 1 ? "" : "s"}` : ""}
                            {item.lastError ? ` · ${item.lastError}` : ""}
                          </p>
                        </>
                      }
                    >
                      <div class="mt-2 flex flex-col gap-2">
                        <Input
                          value={editName()}
                          aria-label={tr("schedulesEditScheduleName")}
                          placeholder={tr("schedulesNameOptional")}
                          onInput={(event) => setEditName(event.currentTarget.value)}
                          class="select-text"
                        />
                        <div class="flex gap-2">
                          <select
                            value={editType()}
                            aria-label={tr("schedulesEditScheduleType")}
                            onChange={(event) => {
                              setEditType(event.currentTarget.value as WhenType);
                              setEditValue("");
                            }}
                            class="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
                          >
                            <option value="in">In</option>
                            <option value="every">Every</option>
                            <option value="at">At</option>
                          </select>
                          <Input
                            value={editValue()}
                            aria-label={tr("schedulesEditScheduleTime")}
                            type={editType() === "at" ? "datetime-local" : "text"}
                            placeholder={editType() === "every" ? "1h" : editType() === "in" ? "10m" : ""}
                            onInput={(event) => setEditValue(event.currentTarget.value)}
                            class="flex-1 select-text"
                          />
                        </div>
                        <Textarea
                          value={editPrompt()}
                          aria-label={tr("schedulesEditSchedulePrompt")}
                          onInput={(event) => setEditPrompt(event.currentTarget.value)}
                          class="select-text"
                        />
                        <div class="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={saving()}
                            onClick={() => setEditing(undefined)}
                          >
                            Cancel
                          </Button>
                          <Button type="button" size="xs" disabled={saving()} onClick={() => void saveEdit()}>
                            {saving() ? "Saving…" : "Save"}
                          </Button>
                        </div>
                      </div>
                    </Show>
                  </div>
                  <Show when={editing() !== item.id}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={item.status === "paused" ? "Resume schedule" : "Pause schedule"}
                      disabled={item.status === "done"}
                      onClick={() => void togglePause(item)}
                    >
                      {item.status === "paused" ? <Play /> : <Pause />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Edit schedule ${item.name || item.id}`}
                      onClick={() => startEdit(item)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Delete schedule ${item.name || item.id}`}
                      onClick={() => void remove(item)}
                    >
                      <Trash2 />
                    </Button>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
