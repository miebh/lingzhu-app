import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProviderLogo } from "./ProviderLogo";
import type { ProviderDraft } from "./types";

interface Props {
  open: boolean;
  /** Existing provider to edit, or a prefilled draft for a new one. */
  initial?: ProviderDraft;
  /** Set when editing; the id stays fixed so saved sessions keep resolving. */
  editingID?: string;
  existingIDs: string[];
  busy?: boolean;
  /** Open the Advanced block immediately, for callers that edit the catalog. */
  advanced?: boolean;
  /** Match the connect flow's wide, base-surface dialog. */
  presentation?: "default" | "connect";
  onOpenChange: (open: boolean) => void;
  onSave: (provider: ProviderDraft) => void;
}

/**
 * Provider connect dialog. The default surface is one key field, like the
 * reference's connect flow; endpoint and model details sit behind Advanced.
 */
export function ProviderDialog({
  open,
  initial,
  editingID,
  existingIDs,
  busy = false,
  advanced = false,
  presentation = "default",
  onOpenChange,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ProviderDraft>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? clone(initial) : undefined);
    setAdvancedOpen(advanced || !initial?.id);
    setNewModel("");
    setError(undefined);
  }, [open, initial, advanced]);

  if (!open || !draft) return null;

  const editing = editingID !== undefined;
  const update = (patch: Partial<ProviderDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  const updateModel = (index: number, patch: Partial<ProviderDraft["models"][number]>) =>
    update({
      models: draft.models.map((model, at) => (at === index ? { ...model, ...patch } : model)),
    });

  const removeModel = (index: number) => update({ models: draft.models.filter((_, at) => at !== index) });

  const addModel = () => {
    const id = newModel.trim();
    if (!id) {
      setError("Model id is required.");
      return;
    }
    if (draft.models.some((model) => model.id === id)) {
      setError(`Model ${id} already exists.`);
      return;
    }
    setError(undefined);
    setNewModel("");
    update({ models: [...draft.models, { id, name: id, contextWindow: "128000", enabled: true }] });
  };

  const submit = () => {
    const id = draft.id.trim();
    if (!id) {
      setError("Provider id is required.");
      setAdvancedOpen(true);
      return;
    }
    if (id !== editingID && existingIDs.includes(id)) {
      setError(`Provider ${id} already exists.`);
      return;
    }
    const baseUrl = draft.baseUrl.trim();
    if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) {
      setError("Base URL must be an absolute http(s) URL.");
      setAdvancedOpen(true);
      return;
    }
    const seen = new Set<string>();
    for (const model of draft.models) {
      const modelID = model.id.trim();
      if (!modelID) {
        setError("Every model needs an id.");
        setAdvancedOpen(true);
        return;
      }
      if (seen.has(modelID)) {
        setError(`Model ${modelID} is duplicated.`);
        setAdvancedOpen(true);
        return;
      }
      seen.add(modelID);
      if (!Number.isInteger(Number(model.contextWindow)) || Number(model.contextWindow) < 0) {
        setError(`Model ${modelID} needs a non-negative context window.`);
        setAdvancedOpen(true);
        return;
      }
    }
    onSave({
      ...draft,
      id,
      name: draft.name.trim() || id,
      baseUrl,
      apiKey: draft.apiKey.trim(),
      apiKeyEnv: draft.apiKeyEnv.trim(),
      models: draft.models.map((model) => ({
        ...model,
        id: model.id.trim(),
        name: model.name.trim() || model.id.trim(),
        contextWindow: String(Number(model.contextWindow)),
      })),
    });
  };

  const connect = presentation === "connect";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={connect ? "manage" : "default"}
        className={connect ? "border-0 bg-bg-base p-4 shadow-elevation-raised" : undefined}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-control-md shrink-0 place-items-center rounded-lg bg-bg-layer-01 text-text-muted">
            <ProviderLogo id={draft.id} name={draft.name} className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle className={connect ? "text-body font-[440]" : undefined}>
              {editing ? `Edit ${draft.name || draft.id}` : `Connect ${draft.name || "provider"}`}
            </DialogTitle>
            <span className="truncate font-mono text-caption text-text-faint" title={draft.baseUrl}>
              {draft.baseUrl || "Custom endpoint"}
            </span>
          </div>
        </div>
        <DialogDescription className={connect ? "mt-1" : undefined}>
          {draft.apiKeySet
            ? "A key is stored. Leave this blank to keep it."
            : "The key is written to the shared config and never returned to the client."}
        </DialogDescription>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-meta text-text-muted">API key</span>
            <Input
              type="password"
              autoComplete="off"
              autoFocus
              value={draft.apiKey}
              aria-label="Provider API key"
              placeholder={draft.apiKeySet ? "Stored in config" : "sk-…"}
              onChange={(event) => update({ apiKey: event.target.value })}
              className="select-text"
            />
            {draft.clearKey && <span className="text-caption text-state-fg-warning">Key will be removed on save.</span>}
          </label>

          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
            className="interactive flex h-control-xs items-center gap-1 self-start rounded-md px-1 text-meta text-text-muted hover:text-text-base"
          >
            <ChevronDown className={`size-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            Advanced
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-4 border-t border-border-base pt-4">
              <div className="flex flex-col gap-3">
                <Field label="Provider id">
                  <Input
                    size="sm"
                    value={draft.id}
                    aria-label="Provider id"
                    disabled={editing}
                    onChange={(event) => update({ id: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
                <Field label="Name">
                  <Input
                    size="sm"
                    value={draft.name}
                    aria-label="Provider name"
                    onChange={(event) => update({ name: event.target.value })}
                    className="select-text"
                  />
                </Field>
                <Field label="Base URL">
                  <Input
                    size="sm"
                    value={draft.baseUrl}
                    aria-label="Provider base URL"
                    placeholder="https://api.openai.com/v1"
                    onChange={(event) => update({ baseUrl: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
                <Field label="Key environment variable">
                  <Input
                    size="sm"
                    value={draft.apiKeyEnv}
                    aria-label="Provider key environment variable"
                    placeholder="OPENAI_API_KEY"
                    onChange={(event) => update({ apiKeyEnv: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-meta text-text-muted">Models</span>
                  <span className="text-caption text-text-faint">{draft.models.length}</span>
                  <span className="flex-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => update({ apiKey: "", apiKeySet: false, clearKey: true })}
                    disabled={!draft.apiKeySet && !draft.apiKey}
                    className="text-text-faint hover:text-state-fg-danger"
                  >
                    Clear key
                  </Button>
                </div>
                {draft.models.map((model, index) => (
                  <div key={index} className="flex flex-col gap-1.5 rounded-md border border-border-base p-2">
                    <div className="flex items-center gap-2">
                      <Input
                        size="sm"
                        value={model.id}
                        aria-label={`Model ${index + 1} id`}
                        placeholder="gpt-4.1"
                        onChange={(event) => updateModel(index, { id: event.target.value })}
                        className="min-w-0 flex-1 select-text font-mono"
                      />
                      <Input
                        size="sm"
                        inputMode="numeric"
                        value={model.contextWindow}
                        aria-label={`Model ${index + 1} context window`}
                        onChange={(event) => updateModel(index, { contextWindow: event.target.value })}
                        className="w-20 shrink-0 select-text text-right"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove model ${index + 1}`}
                        onClick={() => removeModel(index)}
                        className="shrink-0 text-text-faint hover:text-text-base"
                      >
                        <X />
                      </Button>
                    </div>
                    <Input
                      size="sm"
                      value={model.name}
                      aria-label={`Model ${index + 1} name`}
                      placeholder={model.id || "Display name"}
                      onChange={(event) => updateModel(index, { name: event.target.value })}
                      className="select-text"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    size="sm"
                    value={newModel}
                    aria-label="New model id"
                    placeholder="New model id"
                    onChange={(event) => setNewModel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addModel();
                      }
                    }}
                    className="min-w-0 flex-1 select-text font-mono"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addModel}>
                    <Plus />
                    Add model
                  </Button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-caption text-state-fg-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border-base pt-4">
          {busy && <span className="mr-auto text-caption text-state-fg-warning">Stop running sessions before saving.</span>}
          <Button
            type="button"
            variant="outline"
            size={connect ? "sm" : "default"}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" size={connect ? "sm" : "default"} onClick={submit} disabled={busy}>
            {editing ? "Save" : "Connect"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-meta text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function clone(provider: ProviderDraft): ProviderDraft {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  };
}
