import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../lib/api";
import type { AppSettings, ConfigRule, SettingsInput } from "../lib/types";

interface Props {
  /** True while any session has a run in flight; saving would restart its core. */
  busy?: boolean;
  /** Receives the workspaces whose core was not restarted by this app. */
  onSaved: (reused: string[]) => void;
}

interface FormState {
  model: string;
  baseUrl: string;
  apiKey: string;
  maxSteps: string;
  contextWindow: string;
  compactKeep: string;
  systemPrompt: string;
  permission: ConfigRule[];
}

const EFFECTS: { value: ConfigRule["effect"]; label: string; tone: string }[] = [
  { value: "allow", label: "Allow", tone: "text-state-fg-success" },
  { value: "ask", label: "Ask", tone: "text-text-base" },
  { value: "deny", label: "Deny", tone: "text-state-fg-danger" },
];

/**
 * Settings page in the main pane: one shared config file, applied by
 * restarting the cores this app owns. The page stays mounted while another tab
 * is active, so an in-progress edit survives tab switches.
 */
export function SettingsPage({ busy = false, onSaved }: Props) {
  const [form, setForm] = useState<FormState>();
  const [configPath, setConfigPath] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(undefined);
    setForm(undefined);
    api
      .settings()
      .then((settings) => {
        if (!alive) return;
        setForm(fromSettings(settings));
        setConfigPath(settings.configPath);
        setApiKeySet(settings.apiKeySet);
      })
      .catch((cause) => {
        if (alive) setError(errorText(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
  };

  const updateRule = (index: number, patch: Partial<ConfigRule>) => {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            permission: previous.permission.map((rule, at) => (at === index ? { ...rule, ...patch } : rule)),
          }
        : previous,
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || saving || busy) return;
    const payload = validate(form);
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const reused = await api.saveSettings(payload);
      // The stored key is never echoed back; reflect that in the field hint.
      if (payload.apiKey) setApiKeySet(true);
      setForm((previous) => (previous ? { ...previous, apiKey: "" } : previous));
      onSaved(reused);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col select-none">
      <div className="scroll-stable flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-settings px-inset-page py-inset-panel">
          <header>
            <h1 className="text-reading font-medium text-text-base">Settings</h1>
            <p className="mt-1 max-w-measure-standard text-body leading-5 text-text-faint">
              Shared by every workspace. Saving restarts the cores this app owns so the change applies.
            </p>
          </header>

          {loading && (
            <div role="status" aria-label="Loading settings" className="mt-6 flex flex-col gap-3 py-6">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex flex-col gap-2">
                  <div className="h-2 w-20 rounded-xs bg-bg-layer-03 motion-safe:animate-pulse" />
                  <div className="h-7 w-full rounded-md bg-bg-layer-01 motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger"
            >
              {error}
            </p>
          )}

          {form && (
            <form id="settings-form" className="mt-6 flex flex-col gap-6" onSubmit={submit}>
              <section className="flex flex-col gap-3">
                <h2 className="text-body font-medium text-text-base">Model</h2>
                <Field label="Model" hint="Provider model id, for example anthropic/claude-sonnet.">
                  <Input
                    value={form.model}
                    aria-label="Model"
                    onChange={(event) => update("model", event.target.value)}
                    placeholder="provider/model"
                    className="select-text"
                  />
                </Field>
                <Field label="Base URL" hint="OpenAI-compatible endpoint. Leave blank to use the core default.">
                  <Input
                    value={form.baseUrl}
                    aria-label="Base URL"
                    onChange={(event) => update("baseUrl", event.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="select-text"
                  />
                </Field>
                <Field
                  label="API key"
                  hint={apiKeySet ? "A key is stored. Leave blank to keep it." : "No key stored; leaving this blank uses OPENAI_API_KEY."}
                >
                  <Input
                    type="password"
                    autoComplete="off"
                    value={form.apiKey}
                    aria-label="API key"
                    onChange={(event) => update("apiKey", event.target.value)}
                    placeholder={apiKeySet ? "Stored in config" : "Not set"}
                    className="select-text"
                  />
                </Field>
                <Field label="Context window" hint="Prompt tokens before compaction. 0 disables automatic compaction.">
                  <Input
                    inputMode="numeric"
                    value={form.contextWindow}
                    aria-label="Context window"
                    onChange={(event) => update("contextWindow", event.target.value)}
                    className="select-text"
                  />
                </Field>
              </section>

              <section className="flex flex-col gap-3 border-t border-border-base pt-4">
                <h2 className="text-body font-medium text-text-base">Agent</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max steps" hint="Model calls per turn.">
                    <Input
                      inputMode="numeric"
                      value={form.maxSteps}
                      aria-label="Max steps"
                      onChange={(event) => update("maxSteps", event.target.value)}
                      className="select-text"
                    />
                  </Field>
                  <Field label="Compact keep" hint="Recent tokens kept verbatim.">
                    <Input
                      inputMode="numeric"
                      value={form.compactKeep}
                      aria-label="Compact keep"
                      onChange={(event) => update("compactKeep", event.target.value)}
                      className="select-text"
                    />
                  </Field>
                </div>
                <Field label="System prompt" hint="Appended after the built-in prompt and project AGENTS.md.">
                  <Textarea
                    value={form.systemPrompt}
                    aria-label="System prompt"
                    onChange={(event) => update("systemPrompt", event.target.value)}
                    placeholder="Extra instructions for every session…"
                    className="max-h-40 min-h-20 select-text"
                  />
                </Field>
              </section>

              <section className="flex flex-col gap-3 border-t border-border-base pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-body font-medium text-text-base">Permissions</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => update("permission", [...form.permission, { action: "", resource: "", effect: "ask" }])}
                    className="text-text-muted hover:text-text-base"
                  >
                    <Plus />
                    Add rule
                  </Button>
                </div>
                <p className="text-meta leading-5 text-text-faint">
                  The last matching rule wins; without a matching rule the tool asks first.
                </p>

                {form.permission.length === 0 ? (
                  <p className="rounded-md border border-border-base px-3 py-2 text-meta text-text-faint">
                    No rules yet — every tool asks for permission.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-0.5 text-caption text-text-faint">
                      <span className="w-20 shrink-0">Action</span>
                      <span className="min-w-0 flex-1">Resource</span>
                      <span className="w-32 shrink-0">Effect</span>
                      <span className="w-control-xs shrink-0" />
                    </div>
                    {form.permission.map((rule, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          size="sm"
                          value={rule.action}
                          aria-label={`Rule ${index + 1} action`}
                          placeholder="bash"
                          onChange={(event) => updateRule(index, { action: event.target.value })}
                          className="w-20 shrink-0 select-text"
                        />
                        <Input
                          size="sm"
                          value={rule.resource}
                          aria-label={`Rule ${index + 1} resource`}
                          placeholder="*"
                          onChange={(event) => updateRule(index, { resource: event.target.value })}
                          className="min-w-0 flex-1 select-text"
                        />
                        <EffectPicker value={rule.effect} onChange={(effect) => updateRule(index, { effect })} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove rule ${index + 1}`}
                          onClick={() => update("permission", form.permission.filter((_, at) => at !== index))}
                          className="text-text-faint hover:text-text-base"
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </form>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border-base px-inset-page py-3">
        <div className="mx-auto flex w-full max-w-settings items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-caption text-text-faint" title={configPath}>
            {configPath}
          </span>
          {busy && (
            <span className="shrink-0 text-caption leading-4 text-state-fg-warning">
              A session is still running. Stop it before saving.
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading || saving}
          >
            Discard
          </Button>
          <Button type="submit" form="settings-form" disabled={!form || loading || saving || busy}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-meta text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-caption leading-4 text-text-faint">{hint}</span>}
    </label>
  );
}

function EffectPicker({ value, onChange }: { value: ConfigRule["effect"]; onChange: (value: ConfigRule["effect"]) => void }) {
  return (
    <div
      role="group"
      aria-label="Effect"
      className="flex h-control-sm w-32 shrink-0 items-center rounded-md border border-border-base p-0.5"
    >
      {EFFECTS.map((effect) => {
        const selected = value === effect.value;
        return (
          <button
            key={effect.value}
            type="button"
            data-selected={selected ? "true" : undefined}
            aria-pressed={selected}
            onClick={() => onChange(effect.value)}
            className={`interactive h-full flex-1 rounded-xs text-caption ${
              selected ? effect.tone : "text-text-faint hover:text-text-muted"
            }`}
          >
            {effect.label}
          </button>
        );
      })}
    </div>
  );
}

function fromSettings(settings: AppSettings): FormState {
  return {
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKey: "",
    maxSteps: String(settings.maxSteps),
    contextWindow: String(settings.contextWindow),
    compactKeep: String(settings.compactKeep),
    systemPrompt: settings.systemPrompt,
    permission: settings.permission.map((rule) => ({ ...rule })),
  };
}

function validate(form: FormState): SettingsInput | string {
  const model = form.model.trim();
  if (!model) return "Model is required.";
  const baseUrl = form.baseUrl.trim();
  if (baseUrl && !/^https?:\/\/[^\s/]+/i.test(baseUrl)) return "Base URL must be an absolute http(s) URL.";
  const maxSteps = Number(form.maxSteps);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) return "Max steps must be at least 1.";
  const contextWindow = Number(form.contextWindow);
  if (!Number.isInteger(contextWindow) || contextWindow < 0) return "Context window cannot be negative.";
  const compactKeep = Number(form.compactKeep);
  if (!Number.isInteger(compactKeep) || compactKeep < 1) return "Compact keep must be at least 1.";
  const permission = form.permission.map((rule) => ({
    action: rule.action.trim(),
    resource: rule.resource.trim(),
    effect: rule.effect,
  }));
  for (const rule of permission) {
    if (!rule.action || !rule.resource) return "Every permission rule needs an action and a resource.";
  }
  return {
    model,
    baseUrl,
    apiKey: form.apiKey.trim(),
    maxSteps,
    contextWindow,
    compactKeep,
    systemPrompt: form.systemPrompt,
    permission,
  };
}

function errorText(cause: unknown): string {
  if (typeof cause === "string") return cause;
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
