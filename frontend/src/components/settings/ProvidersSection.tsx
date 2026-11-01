import { useEffect, useState } from "react";
import { Check, CircleAlert, Ellipsis, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderLogo } from "./ProviderLogo";
import { SettingsSection } from "./primitives";
import type { CoreSettingsScope, ProviderDraft } from "./types";
import type { ProviderPreset } from "../../lib/types";

interface Props {
  scope: CoreSettingsScope;
}

type TestState = { tone: "busy" | "ok" | "error"; text: string };

interface DialogState {
  open: boolean;
  initial?: ProviderDraft;
  editingID?: string;
}

/**
 * Providers page as a list: connected endpoints first, then the preset catalog.
 * All endpoint editing happens in a connect dialog so the page never turns into
 * a form.
 */
export function ProvidersSection({ scope }: Props) {
  const draft = scope.draft;
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  useEffect(() => {
    let alive = true;
    api
      .presets()
      .then((value) => {
        if (alive) setPresets(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const fallbackSelection = (providers: ProviderDraft[]) => {
    const withModels = providers.filter((provider) => provider.models.length > 0);
    const target = withModels.find((provider) => provider.ready) ?? withModels[0];
    return target ? { provider: target.id, model: target.models[0].id } : undefined;
  };

  const saveProvider = (provider: ProviderDraft) => {
    const editingID = dialog.editingID;
    let providers: ProviderDraft[];
    if (editingID !== undefined) {
      providers = draft.providers.map((item) => (item.id === editingID ? provider : item));
    } else {
      providers = [...draft.providers, provider];
    }
    const target = providers.find((item) => item.id === draft.provider);
    if (target && !target.models.some((model) => model.id === draft.model)) {
      const fallback = fallbackSelection(providers);
      scope.updateAndCommit({ providers, ...(fallback ?? { model: target.models[0]?.id ?? "" }) });
    } else {
      scope.updateAndCommit({ providers });
    }
    setDialog({ open: false });
  };

  const removeProvider = (id: string) => {
    const providers = draft.providers.filter((provider) => provider.id !== id);
    if (providers.length === 0) return;
    if (draft.provider === id) {
      const fallback = fallbackSelection(providers);
      if (!fallback) return;
      scope.updateAndCommit({ providers, ...fallback });
      return;
    }
    scope.updateAndCommit({ providers });
  };

  const runTest = async (provider: ProviderDraft) => {
    setTests((prev) => ({ ...prev, [provider.id]: { tone: "busy", text: "Testing…" } }));
    try {
      const message = await api.testProvider(provider.id, provider.baseUrl, "", provider.apiKeyEnv);
      setTests((prev) => ({ ...prev, [provider.id]: { tone: "ok", text: message } }));
    } catch (error) {
      setTests((prev) => ({ ...prev, [provider.id]: { tone: "error", text: messageOf(error) } }));
    }
  };

  const openPreset = (preset: ProviderPreset) => {
    setDialog({
      open: true,
      initial: {
        id: preset.id,
        name: preset.name,
        baseUrl: preset.baseUrl,
        apiKey: "",
        apiKeyEnv: preset.apiKeyEnv,
        apiKeySet: false,
        clearKey: false,
        ready: false,
        models: preset.models.map((model) => ({
          id: model.id,
          name: model.name,
          contextWindow: String(model.contextWindow),
          enabled: true,
        })),
      },
    });
  };

  const openCustom = () => {
    setDialog({
      open: true,
      initial: {
        id: "",
        name: "",
        baseUrl: "",
        apiKey: "",
        apiKeyEnv: "",
        apiKeySet: false,
        clearKey: false,
        ready: false,
        models: [],
      },
    });
  };

  const openEdit = (provider: ProviderDraft) => {
    setDialog({ open: true, initial: provider, editingID: provider.id });
  };

  const availablePresets = presets.filter((preset) => !draft.providers.some((provider) => provider.id === preset.id));

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Providers"
        description="Configured OpenAI-compatible endpoints. Select one to edit its key, endpoint or models."
      >
        <div className="flex flex-col">
          {draft.providers.map((provider) => {
            const canRemove =
              draft.providers.length > 1 &&
              (provider.id !== draft.provider ||
                draft.providers.some((item) => item.id !== provider.id && item.models.length > 0));
            const result = tests[provider.id];
            return (
              <div key={provider.id} className="border-b-[0.5px] border-border-base last:border-0">
                <div className="flex items-center gap-2 py-4">
                  <button
                    type="button"
                    onClick={() => openEdit(provider)}
                    className="interactive flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left"
                  >
                    <ProviderLogo id={provider.id} name={provider.name} className="size-4 shrink-0 text-text-muted" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-body text-text-base">{provider.name || provider.id}</span>
                        {provider.id === draft.provider && (
                          <span className="shrink-0 text-caption text-text-accent">Default</span>
                        )}
                        <span className="flex shrink-0 items-center gap-1 text-caption text-text-faint">
                          <span
                            className={`size-1.5 rounded-full ${
                              provider.ready ? "bg-state-fg-success" : "bg-state-fg-warning"
                            }`}
                          />
                          {provider.ready ? "Ready" : "No key"}
                        </span>
                      </span>
                      <span className="truncate font-mono text-caption text-text-faint" title={provider.baseUrl}>
                        {provider.baseUrl || "No endpoint"}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-caption text-text-faint sm:block">
                      {provider.models.length} models
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Actions for ${provider.name}`}
                        className="text-text-faint hover:text-text-base"
                      >
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="end">
                      <DropdownMenuItem onSelect={() => openEdit(provider)}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void runTest(provider)}>
                        {result?.tone === "busy" ? <LoaderCircle className="animate-spin" /> : <CircleAlert />}
                        Test
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive disabled={!canRemove} onSelect={() => removeProvider(provider.id)}>
                        <Trash2 />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {result && result.tone !== "busy" && (
                  <p
                    role="status"
                    className={`flex items-start gap-1.5 pb-3 text-caption leading-4 ${
                      result.tone === "ok" ? "text-state-fg-success" : "text-state-fg-danger"
                    }`}
                  >
                    {result.tone === "ok" ? (
                      <Check className="mt-0.5 size-3 shrink-0" />
                    ) : (
                      <CircleAlert className="mt-0.5 size-3 shrink-0" />
                    )}
                    <span className="select-text">{result.text}</span>
                  </p>
                )}
              </div>
            );
          })}
          {draft.providers.length === 0 && (
            <p className="py-4 text-meta text-text-faint">No providers yet. Connect one below.</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Presets"
        description="Mainstream endpoints with models prefilled. Connect asks only for the key."
      >
        <div className="flex flex-col">
          {availablePresets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-3 border-b-[0.5px] border-border-base py-3 last:border-0"
            >
              <ProviderLogo id={preset.id} name={preset.name} className="size-4 shrink-0 text-text-muted" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body text-text-base">{preset.name}</span>
                <span className="truncate font-mono text-caption text-text-faint" title={preset.baseUrl}>
                  {preset.apiKeyEnv} · {preset.models.length} models
                </span>
              </div>
              <Button type="button" variant="outline" size="xs" onClick={() => openPreset(preset)} className="shrink-0">
                Connect
              </Button>
            </div>
          ))}
          {presets.length > 0 && availablePresets.length === 0 && (
            <span className="py-3 text-meta text-text-faint">Every preset is already connected.</span>
          )}
          {presets.length === 0 && <span className="py-3 text-meta text-text-faint">Loading presets…</span>}
        </div>
        <div className="border-t-[0.5px] border-border-base py-3">
          <Button type="button" variant="ghost" size="sm" onClick={openCustom}>
            <Plus />
            Custom endpoint
          </Button>
        </div>
      </SettingsSection>

      <ProviderDialog
        open={dialog.open}
        initial={dialog.initial}
        editingID={dialog.editingID}
        existingIDs={draft.providers.map((provider) => provider.id)}
        busy={scope.busy}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onSave={saveProvider}
      />
    </div>
  );
}
