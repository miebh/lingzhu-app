import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleAlert, Plus, Search, X } from "@lingzhu/ui/icons";
import { Loader } from "@lingzhu/ui/loader";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Switch } from "@lingzhu/ui/switch";
import type { ProviderSettings } from "@lingzhu/ui/types";
import { useCatalog, usePreferences, usePreferencesStore } from "../../app/useApp";
import { ConnectProviderDialog } from "../settings/ConnectProviderDialog";
import { ProviderLogo } from "../settings/ProviderLogo";
import { useCoreConfig } from "../settings/useCoreConfig";
import type { CoreDraft, ProviderDraft } from "../settings/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  /** True while any session is running; adding a provider is refused. */
  busy: boolean;
  /** Open the connect-provider step immediately. */
  initialConnect?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (reused: string[]) => void;
}

const EMPTY_PROVIDERS: ProviderSettings[] = [];

const modelKey = (providerID: string, modelID: string) => `${providerID}\u0000${modelID}`;

/**
 * The reference manage-models dialog: every configured provider with a switch
 * per model. The list is the catalog the picker reads, and visibility is a
 * client preference, so a toggle never rewrites the shared config or restarts
 * a core. Connecting a provider still writes the shared config.
 */
export function ManageModelsDialog({ open, busy, initialConnect = false, onOpenChange, onSaved }: Props) {
  const tr = useT();
  const catalog = useCatalog();
  const providers = catalog?.providers ?? EMPTY_PROVIDERS;
  const preferences = usePreferences();
  const savePreferences = usePreferencesStore((state) => state.save);
  const { draft, settingsError, saveState, saveError, updateAndCommit, reload, dismissSaveError } =
    useCoreConfig({ onSaved });

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [connectOpen, setConnectOpen] = useState(false);
  const openedInitialConnect = useRef(false);

  // Wait for the config draft before opening the connect step, so already-added
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

  const hidden = useMemo(
    () => new Set(preferences.hiddenModels.map((item) => modelKey(item.provider, item.model))),
    [preferences.hiddenModels],
  );

  const shown = (providerID: string, modelID: string) => !hidden.has(modelKey(providerID, modelID));

  const setModelsVisible = (providerID: string, modelIDs: string[], visible: boolean) => {
    const next = new Map(preferences.hiddenModels.map((item) => [modelKey(item.provider, item.model), item]));
    for (const modelID of modelIDs) {
      const key = modelKey(providerID, modelID);
      if (visible) next.delete(key);
      else next.set(key, { provider: providerID, model: modelID });
    }
    void savePreferences({ ...preferences, hiddenModels: [...next.values()] });
  };

  const groups = useMemo(() => {
    return providers
      .map((provider) => {
        const blocked = new Set(provider.blacklist ?? []);
        const allowed = new Set(provider.whitelist ?? []);
        const listed = provider.models.filter(
          (model) => !blocked.has(model.id) && (allowed.size === 0 || allowed.has(model.id)),
        );
        const providerHit =
          !!needle &&
          (provider.name.toLowerCase().includes(needle) || provider.id.toLowerCase().includes(needle));
        const models =
          !needle || providerHit
            ? listed
            : listed.filter(
                (model) =>
                  model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle),
              );
        return { provider, models };
      })
      .filter((group) => group.models.length > 0 || (!needle && group.provider.models.length === 0));
  }, [providers, needle]);

  const disconnectProvider = (id: string) => {
    if (!draft || draft.providers.length === 0) return;
    const providers = draft.providers.filter((provider) => provider.id !== id);
    if (providers.length === 0) {
      updateAndCommit({ providers, provider: "", model: "" });
      return;
    }
    let selection: Partial<CoreDraft> = {};
    if (draft.provider === id) {
      const candidates = providers.flatMap((provider) =>
        provider.models.map((model) => ({ provider: provider.id, model: model.id, ready: provider.ready })),
      );
      const next = candidates.find((item) => item.ready) ?? candidates[0];
      if (!next) return;
      selection = { provider: next.provider, model: next.model };
    }
    updateAndCommit({ providers, ...selection });
  };

  const addProvider = (provider: ProviderDraft) => {
    if (!draft) return;
    const providers = [...draft.providers, provider];
    let selection: Partial<CoreDraft> = {};
    const target = providers.find((item) => item.id === draft.provider);
    if (!target || !target.models.some((model) => model.id === draft.model)) {
      const candidates = providers.flatMap((item) =>
        item.models.map((model) => ({ provider: item.id, model: model.id, ready: item.ready })),
      );
      const next = candidates.find((item) => item.ready) ?? candidates[0];
      if (next) selection = { provider: next.provider, model: next.model };
    }
    updateAndCommit({ providers, ...selection });
  };

  const error = saveError;
  const saving = saveState === "saving";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="manage"
          height="body"
          hideClose
          className="flex flex-col gap-0 overflow-hidden rounded-[12px] border-0 bg-bg-base p-0 shadow-elevation-overlay"
        >
          <div className="flex shrink-0 items-start gap-3 px-3.5 pt-2.5 pb-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <DialogTitle>Manage models</DialogTitle>
              <DialogDescription className="mt-0 text-meta leading-5">
                Choose which models appear in the model picker. Changes save as you toggle.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {saving && (
                <span role="status" aria-label={tr("manageModelsSaving")} className="flex size-control-sm items-center justify-center">
                  <Loader className="size-3.5 text-text-faint" />
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
                {tr("modelPickerConnectProvider")}
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
                aria-label={tr("manageModelsDismissError")}
                onClick={dismissSaveError}
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
                aria-label={tr("manageModelsSearchModels")}
                placeholder={tr("manageModelsSearchModelsOrProviders")}
                onChange={(event) => setQuery(event.target.value)}
                className="border-0 bg-transparent pl-6"
              />
            </div>
          </div>

          <div role="group" aria-label={tr("manageModelsModels")} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
            {!draft && !settingsError && providers.length === 0 && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">
                <span className="flex items-center gap-2">
                  <Loader className="size-3.5" />
                  Loading models…                </span>
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

            {groups.length === 0 && (draft || providers.length > 0) && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">
                {needle ? "No matching models" : "No models available. Connect a provider first."}
              </div>
            )}

            {groups.map((group) => {
              const isCollapsed = !needle && collapsed[group.provider.id] === true;
              const groupShown =
                group.provider.models.length > 0 &&
                group.provider.models.every((model) => shown(group.provider.id, model.id));
              const name = group.provider.name || group.provider.id;
              return (
                <div
                  key={group.provider.id}
                  className="relative border-b-[0.5px] border-border-base py-2 last:border-0"
                >
                  <div className="relative flex min-h-9 items-center gap-1">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsed((prev) => ({ ...prev, [group.provider.id]: !isCollapsed }))
                      }
                      className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-3 pe-10 text-left"
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
                      <span className="min-w-0 flex-1 truncate text-body font-[530] text-text-base">{name}</span>
                      {!group.provider.ready && (
                        <span className="shrink-0 text-caption text-state-fg-warning">No API key</span>
                      )}
                      {group.provider.models.length === 0 && (
                        <span className="shrink-0 text-caption text-text-faint">No models</span>
                      )}
                    </button>
                    <Switch
                      aria-label={`Show ${name} models`}
                      checked={groupShown}
                      disabled={group.provider.models.length === 0}
                      onCheckedChange={(checked) =>
                        setModelsVisible(
                          group.provider.id,
                          group.provider.models.map((model) => model.id),
                          checked,
                        )
                      }
                      className="absolute end-4 top-1/2 -translate-y-1/2"
                    />
                  </div>

                  {!isCollapsed && group.models.length > 0 && (
                    <div className="mt-1 flex flex-col divide-y-[0.5px] divide-border-base">
                      {group.models.map((model) => {
                        const modelShown = shown(group.provider.id, model.id);
                        return (
                          <div
                            key={`${group.provider.id}:${model.id}`}
                            className="interactive flex h-9 items-center gap-1 rounded-md px-2"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setModelsVisible(group.provider.id, [model.id], !modelShown)
                              }
                              className="flex h-full min-w-0 flex-1 items-center text-left"
                            >
                              <span
                                className={`min-w-0 flex-1 truncate text-body font-[440] ${
                                  modelShown ? "text-text-base" : "text-text-faint"
                                }`}
                              >
                                {model.name || model.id}
                              </span>
                            </button>
                            <Switch
                              aria-label={`Show ${model.name || model.id}`}
                              checked={modelShown}
                              onCheckedChange={(checked) =>
                                setModelsVisible(group.provider.id, [model.id], checked)
                              }
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
        existing={draft?.providers ?? []}
        busy={busy}
        canDisconnect={(draft?.providers.length ?? 0) > 0}
        onOpenChange={setConnectOpen}
        onSave={addProvider}
        onDisconnect={disconnectProvider}
      />
    </>
  );
}
