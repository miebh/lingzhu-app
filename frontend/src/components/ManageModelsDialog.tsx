import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleAlert, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { ModelVisibility } from "../lib/types";
import { useCatalogStore } from "../store/catalog";
import { ConnectProviderDialog } from "./settings/ConnectProviderDialog";
import { ProviderLogo } from "./settings/ProviderLogo";
import { useCoreConfig } from "./settings/useCoreConfig";
import type { CoreDraft, ProviderDraft } from "./settings/types";

interface Props {
  open: boolean;
  /** True while any session is running; adding a provider is refused. */
  busy: boolean;
  /** Open the connect-provider step immediately. */
  initialConnect?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (reused: string[]) => void;
}

/**
 * The reference manage-models dialog: every configured provider with a switch
 * per model. Visibility is a presentation flag, so it saves without restarting
 * a core; connecting a provider still writes the shared config.
 */
export function ManageModelsDialog({ open, busy, initialConnect = false, onOpenChange, onSaved }: Props) {
  const { draft, settingsError, saveState, saveError, update, updateAndCommit, reload, dismissSaveError } =
    useCoreConfig({ onSaved });
  const reloadCatalog = useCatalogStore((state) => state.reload);

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [connectOpen, setConnectOpen] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string>();
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const visibilitySeq = useRef(0);
  const openedInitialConnect = useRef(false);

  // Wait for the catalog before opening the connect step, so already-added
  // providers are disabled in the picker. Only the first load may auto-open it.
  useEffect(() => {
    if (!open) {
      openedInitialConnect.current = false;
      return;
    }
    if (initialConnect && draft && !openedInitialConnect.current) {
      openedInitialConnect.current = true;
      setConnectOpen(true);
    }
  }, [open, initialConnect, draft]);

  const needle = query.trim().toLowerCase();

  const groups = useMemo(() => {
    return (draft?.providers ?? [])
      .map((provider) => {
        const providerHit =
          !!needle &&
          (provider.name.toLowerCase().includes(needle) || provider.id.toLowerCase().includes(needle));
        const models =
          !needle || providerHit
            ? provider.models
            : provider.models.filter(
                (model) =>
                  model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle),
              );
        return { provider, models };
      })
      .filter((group) => group.models.length > 0 || (!needle && group.provider.models.length === 0));
  }, [draft?.providers, needle]);

  const persistVisibility = async (providers: ProviderDraft[]) => {
    const entries: ModelVisibility[] = providers.flatMap((provider) =>
      provider.models.map((model) => ({
        provider: provider.id,
        model: model.id,
        enabled: model.enabled !== false,
      })),
    );
    const seq = ++visibilitySeq.current;
    setVisibilitySaving(true);
    setVisibilityError(undefined);
    try {
      await api.saveModelVisibility(entries);
      if (seq !== visibilitySeq.current) return;
      await reloadCatalog();
    } catch (cause) {
      if (seq !== visibilitySeq.current) return;
      setVisibilityError(messageOf(cause));
      reload();
      void reloadCatalog();
    } finally {
      if (seq === visibilitySeq.current) setVisibilitySaving(false);
    }
  };

  const setProviders = (providers: ProviderDraft[]) => {
    update({ providers });
    void persistVisibility(providers);
  };

  const toggleProvider = (provider: ProviderDraft, enabled: boolean) => {
    if (!draft) return;
    setProviders(
      draft.providers.map((item) =>
        item.id === provider.id
          ? { ...item, models: item.models.map((model) => ({ ...model, enabled })) }
          : item,
      ),
    );
  };

  const toggleModel = (providerID: string, modelID: string, enabled: boolean) => {
    if (!draft) return;
    setProviders(
      draft.providers.map((provider) =>
        provider.id !== providerID
          ? provider
          : {
              ...provider,
              models: provider.models.map((model) => (model.id === modelID ? { ...model, enabled } : model)),
            },
      ),
    );
  };

  const addProvider = (provider: ProviderDraft) => {
    if (!draft) return;
    const providers = [...draft.providers, provider];
    let selection: Partial<CoreDraft> = {};
    const target = providers.find((item) => item.id === draft.provider);
    if (!target || !target.models.some((model) => model.id === draft.model)) {
      const candidates = providers.flatMap((item) =>
        item.models
          .filter((model) => model.enabled !== false)
          .map((model) => ({ provider: item.id, model: model.id, ready: item.ready })),
      );
      const next = candidates.find((item) => item.ready) ?? candidates[0];
      if (next) selection = { provider: next.provider, model: next.model };
    }
    updateAndCommit({ providers, ...selection });
  };

  const error = visibilityError ?? saveError;
  const saving = visibilitySaving || saveState === "saving";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="manage"
          height="body"
          className="flex flex-col gap-0 overflow-hidden border-0 bg-bg-base p-0 shadow-elevation-raised"
        >
          <div className="flex shrink-0 items-start gap-3 px-3 pt-2 pb-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <DialogTitle className="text-body font-[440]">Manage models</DialogTitle>
              <DialogDescription className="mt-0">
                Choose which models appear in the model picker. Changes save as you toggle.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {saving && (
                <span role="status" aria-label="Saving" className="flex size-control-sm items-center justify-center">
                  <LoaderCircle className="size-3.5 animate-spin text-text-faint" />
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!draft}
                onClick={() => setConnectOpen(true)}
              >
                <Plus />
                Connect provider
              </Button>
            </div>
          </div>

          {error && (
            <div className="mx-3 mb-1.5 flex items-start gap-2 rounded-md bg-state-bg-danger px-2 py-1.5 text-caption leading-4 text-state-fg-danger">
              <CircleAlert className="mt-0.5 size-3 shrink-0" />
              <span role="alert" className="min-w-0 flex-1 select-text">
                {error}
              </span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => {
                  setVisibilityError(undefined);
                  dismissSaveError();
                }}
                className="shrink-0 text-text-faint hover:text-text-base"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          <div className="shrink-0 border-b-[0.5px] border-border-weak px-1.5 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-1.5 size-3.5 -translate-y-1/2 text-text-muted" />
              <Input
                autoFocus
                size="sm"
                value={query}
                aria-label="Search models"
                placeholder="Search models or providers"
                onChange={(event) => setQuery(event.target.value)}
                className="border-0 bg-transparent pl-6"
              />
            </div>
          </div>

          <div role="group" aria-label="Models" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
            {!draft && !settingsError && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Loading models…
                </span>
              </div>
            )}

            {settingsError && !draft && (
              <div className="flex flex-col items-start gap-3 px-2 py-6">
                <p role="alert" className="text-meta leading-5 text-state-fg-danger">
                  {settingsError}
                </p>
                <Button variant="outline" size="sm" onClick={reload}>
                  Retry
                </Button>
              </div>
            )}

            {draft && groups.length === 0 && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">
                {needle ? "No matching models" : "No models available. Connect a provider first."}
              </div>
            )}

            {draft &&
              groups.map((group) => {
                const isCollapsed = !needle && collapsed[group.provider.id] === true;
                const visible =
                  group.provider.models.length > 0 && group.provider.models.every((model) => model.enabled !== false);
                const name = group.provider.name || group.provider.id;
                return (
                  <div
                    key={group.provider.id}
                    className="border-b-[0.5px] border-border-base px-1 py-2 last:border-0"
                  >
                    <div className="interactive flex h-control-md items-center gap-1 rounded-md px-1">
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() =>
                          setCollapsed((prev) => ({ ...prev, [group.provider.id]: !isCollapsed }))
                        }
                        className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <ChevronDown
                          className={`size-3 shrink-0 text-text-faint transition-transform ${
                            isCollapsed ? "-rotate-90" : ""
                          }`}
                        />
                        <ProviderLogo
                          id={group.provider.id}
                          name={group.provider.name}
                          className="size-4 shrink-0 text-text-muted"
                        />
                        <span className="min-w-0 flex-1 truncate text-body font-medium text-text-base">{name}</span>
                        {!group.provider.ready && (
                          <span className="shrink-0 text-caption text-state-fg-warning">No API key</span>
                        )}
                        {group.provider.models.length === 0 && (
                          <span className="shrink-0 text-caption text-text-faint">No models</span>
                        )}
                      </button>
                      <Switch
                        aria-label={`Show ${name} models`}
                        checked={visible}
                        disabled={group.provider.models.length === 0}
                        onCheckedChange={(checked) => toggleProvider(group.provider, checked)}
                      />
                    </div>

                    {!isCollapsed && group.models.length > 0 && (
                      <div className="mt-1 flex flex-col divide-y-[0.5px] divide-border-base">
                        {group.models.map((model) => {
                          const shown = model.enabled !== false;
                          return (
                            <div
                              key={`${group.provider.id}:${model.id}`}
                              className="interactive flex h-control-md items-center gap-1 rounded-md px-1"
                            >
                              <button
                                type="button"
                                onClick={() => toggleModel(group.provider.id, model.id, !shown)}
                                className="flex h-full min-w-0 flex-1 items-center px-1 text-left"
                              >
                                <span
                                  className={`min-w-0 flex-1 truncate text-body ${
                                    shown ? "text-text-base" : "text-text-faint"
                                  }`}
                                >
                                  {model.name || model.id}
                                </span>
                              </button>
                              <Switch
                                aria-label={`Show ${model.name || model.id}`}
                                checked={shown}
                                onCheckedChange={(checked) => toggleModel(group.provider.id, model.id, checked)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      <ConnectProviderDialog
        open={connectOpen}
        existingIDs={draft?.providers.map((provider) => provider.id) ?? []}
        busy={busy}
        onOpenChange={setConnectOpen}
        onSave={addProvider}
      />
    </>
  );
}
