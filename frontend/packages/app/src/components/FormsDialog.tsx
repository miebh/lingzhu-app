import { useEffect, useState } from "react";
import { ClipboardList, Plus, Save, Trash2, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { formsExportName, serializeForms } from "../lib/formsExport";
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

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "pending"
      ? "text-state-fg-warning"
      : status === "cancelled"
        ? "text-state-fg-danger"
        : "text-state-fg-success";
  return (
    <span className={`rounded-xs border border-border-base px-1 text-caption ${tone}`}>{status}</span>
  );
}

/** Lists, creates and answers structured forms of one session. */
export function FormsDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [formTitle, setFormTitle] = useState("");
  const [fields, setFields] = useState<DraftField[]>([
    { name: "", label: "", type: "text", required: false, options: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async (quiet = false) => {
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

  useEffect(() => {
    if (!open) {
      setForms([]);
      setDrafts({});
      setFormTitle("");
      setFields([{ name: "", label: "", type: "text", required: false, options: "" }]);
      setError("");
      setSaving(false);
      setNotice("");
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(true), 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const saveForms = async () => {
    if (!sessionID || forms.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        formsExportName(sessionID, forms.length),
        serializeForms({ sessionId: sessionID, forms }),
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
    setDrafts((current) => ({
      ...current,
      [formID]: { ...(current[formID] ?? {}), [name]: value },
    }));
  };

  const reply = async (form: FormRecord, cancelled = false) => {
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      const updated = await api.replyForm(
        workspace,
        sessionID,
        form.id,
        cancelled ? {} : drafts[form.id] ?? {},
        cancelled,
      );
      setForms((current) => current.map((entry) => (entry.id === form.id ? updated : entry)));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const updateField = (index: number, patch: Partial<DraftField>) => {
    setFields((current) =>
      current.map((field, position) => (position === index ? { ...field, ...patch } : field)),
    );
  };

  const create = async () => {
    if (!workspace || !sessionID) return;
    const payload: FormField[] = [];
    for (const field of fields) {
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
      const created = await api.createForm(workspace, sessionID, formTitle.trim(), payload);
      setForms((current) => [...current, created]);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-text-faint" />
              Forms
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {forms.filter((form) => form.status === "pending").length} pending
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || forms.length === 0}
              onClick={() => void saveForms()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} mono />

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {forms.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No forms yet."}
            </p>
          ) : (
            forms.map((form) => (
              <div key={form.id} className="border-b border-border-base p-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body text-text-base">{form.title}</span>
                  <StatusBadge status={form.status} />
                  <span className="text-caption text-text-faint">{formatDateTime(form.askedAt)}</span>
                </div>
                {form.status === "pending" ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {form.fields.map((field) => {
                      const value = drafts[form.id]?.[field.name] ?? "";
                      const label = `${field.label || field.name}${field.required ? " *" : ""}`;
                      if (field.type === "select" || (field.options && field.options.length > 0)) {
                        return (
                          <label key={field.name} className="flex flex-col gap-1 text-caption text-text-faint">
                            {label}
                            <select
                              value={value}
                              onChange={(event) => updateDraft(form.id, field.name, event.target.value)}
                              className="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
                            >
                              <option value="">Select…</option>
                              {(field.options ?? []).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      }
                      if (field.type === "boolean") {
                        return (
                          <label key={field.name} className="flex items-center gap-2 text-meta text-text-muted">
                            <input
                              type="checkbox"
                              checked={value === "true"}
                              onChange={(event) =>
                                updateDraft(form.id, field.name, event.target.checked ? "true" : "false")
                              }
                            />
                            {label}
                          </label>
                        );
                      }
                      return (
                        <label key={field.name} className="flex flex-col gap-1 text-caption text-text-faint">
                          {label}
                          <Input
                            value={value}
                            placeholder={field.placeholder || ""}
                            onChange={(event) => updateDraft(form.id, field.name, event.target.value)}
                            className="select-text"
                          />
                        </label>
                      );
                    })}
                    <div className="mt-1 flex justify-end gap-2">
                      <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => void reply(form, true)}>
                        <X />
                        {tr("dialogCancelForm")}
                      </Button>
                      <Button type="button" size="xs" disabled={busy} onClick={() => void reply(form)}>
                        Submit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-caption text-text-faint">
                    {form.cancelled ? "Cancelled" : "Answered"}
                    {form.values && Object.keys(form.values).length > 0
                      ? ` · ${Object.entries(form.values)
                          .map(([key, value]) => `${key}=${String(value)}`)
                          .join(", ")}`
                      : ""}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-3 shrink-0 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <p className="text-caption text-text-faint">Create form</p>
          <Input
            value={formTitle}
            aria-label={tr("formsFormTitle")}
            placeholder={tr("dialogFieldTitle")}
            onChange={(event) => setFormTitle(event.target.value)}
            className="mt-2 select-text"
          />
          <div className="mt-2 flex flex-col gap-2">
            {fields.map((field, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  value={field.name}
                  aria-label={`Field ${index + 1} name`}
                  placeholder={tr("dialogFieldName")}
                  onChange={(event) => updateField(index, { name: event.target.value })}
                  className="w-32 select-text font-mono"
                />
                <Input
                  value={field.label}
                  aria-label={`Field ${index + 1} label`}
                  placeholder={tr("dialogFieldLabel")}
                  onChange={(event) => updateField(index, { label: event.target.value })}
                  className="min-w-32 flex-1 select-text"
                />
                <select
                  value={field.type}
                  aria-label={`Field ${index + 1} type`}
                  onChange={(event) => updateField(index, { type: event.target.value })}
                  className="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-meta text-text-base outline-none"
                >
                  <option value="text">text</option>
                  <option value="textarea">textarea</option>
                  <option value="select">select</option>
                  <option value="boolean">boolean</option>
                </select>
                <Input
                  value={field.options}
                  aria-label={`Field ${index + 1} options`}
                  placeholder={tr("formsOptionsCommaSeparated")}
                  onChange={(event) => updateField(index, { options: event.target.value })}
                  className="w-40 select-text"
                />
                <label className="flex items-center gap-1 text-caption text-text-faint">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(index, { required: event.target.checked })}
                  />
                  required
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label={`Remove field ${index + 1}`}
                  onClick={() => setFields((current) => current.filter((_, position) => position !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() =>
                setFields((current) => [
                  ...current,
                  { name: "", label: "", type: "text", required: false, options: "" },
                ])
              }
            >
              <Plus />
              {tr("dialogAddField")}
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void create()}>
              {tr("dialogCreateForm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
