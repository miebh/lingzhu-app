import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { ClipboardList, Plus, Save, Trash2, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { formsExportName, serializeForms } from "../../lib/formsExport";
import type { FormField, FormRecord } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
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

interface DraftField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string;
}

function StatusBadge(props: { status: string }) {
  const tone = () =>
    props.status === "pending"
      ? "text-state-fg-warning"
      : props.status === "cancelled"
        ? "text-state-fg-danger"
        : "text-state-fg-success";
  return (
    <span class={`rounded-xs border border-border-base px-1 text-caption ${tone()}`}>{props.status}</span>
  );
}

/** Lists, creates and answers structured forms of one session. */
export function FormsDialog(props: Props) {
  const tr = useT();
  const [forms, setForms] = createSignal<FormRecord[]>([]);
  const [drafts, setDrafts] = createSignal<Record<string, Record<string, string>>>({});
  const [formTitle, setFormTitle] = createSignal("");
  const [fields, setFields] = createSignal<DraftField[]>([
    { name: "", label: "", type: "text", required: false, options: "" },
  ]);
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async (quiet = false) => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    if (!quiet) setLoading(true);
    try {
      setForms(await api.forms(workspace, sessionID));
      if (!quiet) setError("");
    } catch (err) {
      if (!quiet) setError(messageOf(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  createEffect(() => {
    if (!props.open) {
      setForms([]);
      setDrafts({});
      setFormTitle("");
      setFields([{ name: "", label: "", type: "text", required: false, options: "" }]);
      setError("");
      setSaving(false);
      setNotice("");
      return;
    }
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    void load();
    const timer = window.setInterval(() => void load(true), 10_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const saveForms = async () => {
    const sessionID = props.sessionID;
    if (!sessionID || forms().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        formsExportName(sessionID, forms().length),
        serializeForms({ sessionId: sessionID, forms: forms() }),
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

  const updateDraft = (formID: string, name: string, value: string) => {
    update(setDrafts, drafts, (current) => ({
      ...current,
      [formID]: { ...(current[formID] ?? {}), [name]: value },
    }));
  };

  const reply = async (form: FormRecord, cancelled = false) => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      const updated = await api.replyForm(
        workspace,
        sessionID,
        form.id,
        cancelled ? {} : drafts()[form.id] ?? {},
        cancelled,
      );
      update(setForms, forms, (current) =>
        current.map((entry) => (entry.id === form.id ? updated : entry)),
      );
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const updateField = (index: number, patch: Partial<DraftField>) => {
    update(setFields, fields, (current) =>
      current.map((field, position) => (position === index ? { ...field, ...patch } : field)),
    );
  };

  const create = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const payload: FormField[] = [];
    for (const field of fields()) {
      const name = field.name.trim();
      if (!name) {
        setError("Every field needs a name.");
        return;
      }
      payload.push({
        name,
        label: field.label.trim() || name,
        type: field.type || "text",
        required: field.required,
        options: field.options
          .split(",")
          .map((option) => option.trim())
          .filter(Boolean),
      });
    }
    if (payload.length === 0) {
      setError("Add at least one field.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.createForm(workspace, sessionID, formTitle().trim(), payload);
      update(setForms, forms, (current) => [...current, created]);
      setFormTitle("");
      setFields([{ name: "", label: "", type: "text", required: false, options: "" }]);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <ClipboardList class="size-4 text-text-faint" />
              Forms
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {forms().filter((form) => form.status === "pending").length} pending
            </DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || forms().length === 0}
              onClick={() => void saveForms()}
            >
              <Save />
              {saving() ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} mono />

        <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={forms().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? "Loading…" : "No forms yet."}
              </p>
            }
          >
            <For each={forms()}>
              {(form) => (
                <div class="border-b border-border-base p-3 last:border-b-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-body text-text-base">{form.title}</span>
                    <StatusBadge status={form.status} />
                    <span class="text-caption text-text-faint">{formatDateTime(form.askedAt)}</span>
                  </div>
                  <Show
                    when={form.status === "pending"}
                    fallback={
                      <p class="mt-1 text-caption text-text-faint">
                        {form.cancelled ? "Cancelled" : "Answered"}
                        {form.values && Object.keys(form.values).length > 0
                          ? ` · ${Object.entries(form.values)
                              .map(([key, value]) => `${key}=${String(value)}`)
                              .join(", ")}`
                          : ""}
                      </p>
                    }
                  >
                    <div class="mt-2 flex flex-col gap-2">
                      <For each={form.fields}>
                        {(field) => {
                          const value = () => drafts()[form.id]?.[field.name] ?? "";
                          const label = () => `${field.label || field.name}${field.required ? " *" : ""}`;
                          return (
                            <Show
                              when={field.type === "select" || (field.options && field.options.length > 0)}
                              fallback={
                                <Show
                                  when={field.type === "boolean"}
                                  fallback={
                                    <label class="flex flex-col gap-1 text-caption text-text-faint">
                                      {label()}
                                      <Input
                                        value={value()}
                                        placeholder={field.placeholder || ""}
                                        onInput={(event) =>
                                          updateDraft(form.id, field.name, event.currentTarget.value)
                                        }
                                        class="select-text"
                                      />
                                    </label>
                                  }
                                >
                                  <label class="flex items-center gap-2 text-meta text-text-muted">
                                    <input
                                      type="checkbox"
                                      checked={value() === "true"}
                                      onChange={(event) =>
                                        updateDraft(
                                          form.id,
                                          field.name,
                                          event.currentTarget.checked ? "true" : "false",
                                        )
                                      }
                                    />
                                    {label()}
                                  </label>
                                </Show>
                              }
                            >
                              <label class="flex flex-col gap-1 text-caption text-text-faint">
                                {label()}
                                <select
                                  value={value()}
                                  onChange={(event) =>
                                    updateDraft(form.id, field.name, event.currentTarget.value)
                                  }
                                  class="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
                                >
                                  <option value="">Select…</option>
                                  <For each={field.options ?? []}>
                                    {(option) => <option value={option}>{option}</option>}
                                  </For>
                                </select>
                              </label>
                            </Show>
                          );
                        }}
                      </For>
                      <div class="mt-1 flex justify-end gap-2">
                        <Button type="button" variant="outline" size="xs" disabled={busy()} onClick={() => void reply(form, true)}>
                          <X />
                          {tr("dialogCancelForm")}
                        </Button>
                        <Button type="button" size="xs" disabled={busy()} onClick={() => void reply(form)}>
                          Submit
                        </Button>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="mt-3 shrink-0 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <p class="text-caption text-text-faint">Create form</p>
          <Input
            value={formTitle()}
            aria-label={tr("formsFormTitle")}
            placeholder={tr("dialogFieldTitle")}
            onInput={(event) => setFormTitle(event.currentTarget.value)}
            class="mt-2 select-text"
          />
          <div class="mt-2 flex flex-col gap-2">
            <For each={fields()}>
              {(field, index) => (
                <div class="flex flex-wrap items-center gap-2">
                  <Input
                    value={field.name}
                    aria-label={`Field ${index() + 1} name`}
                    placeholder={tr("dialogFieldName")}
                    onInput={(event) => updateField(index(), { name: event.currentTarget.value })}
                    class="w-32 select-text font-mono"
                  />
                  <Input
                    value={field.label}
                    aria-label={`Field ${index() + 1} label`}
                    placeholder={tr("dialogFieldLabel")}
                    onInput={(event) => updateField(index(), { label: event.currentTarget.value })}
                    class="min-w-32 flex-1 select-text"
                  />
                  <select
                    value={field.type}
                    aria-label={`Field ${index() + 1} type`}
                    onChange={(event) => updateField(index(), { type: event.currentTarget.value })}
                    class="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-meta text-text-base outline-none"
                  >
                    <option value="text">text</option>
                    <option value="textarea">textarea</option>
                    <option value="select">select</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <Input
                    value={field.options}
                    aria-label={`Field ${index() + 1} options`}
                    placeholder={tr("formsOptionsCommaSeparated")}
                    onInput={(event) => updateField(index(), { options: event.currentTarget.value })}
                    class="w-40 select-text"
                  />
                  <label class="flex items-center gap-1 text-caption text-text-faint">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) => updateField(index(), { required: event.currentTarget.checked })}
                    />
                    required
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Remove field ${index() + 1}`}
                    onClick={() =>
                      update(setFields, fields, (current) =>
                        current.filter((_, position) => position !== index()),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </For>
          </div>
          <div class="mt-2 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() =>
                update(setFields, fields, (current) => [
                  ...current,
                  { name: "", label: "", type: "text", required: false, options: "" },
                ])
              }
            >
              <Plus />
              {tr("dialogAddField")}
            </Button>
            <Button type="button" size="sm" disabled={busy()} onClick={() => void create()}>
              {tr("dialogCreateForm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
