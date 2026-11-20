import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleAlert, Pencil, Plus, RefreshCw, Unplug } from "@lingzhu/ui/icons";
import { Badge } from "@lingzhu/ui/badge";
import { Loader } from "@lingzhu/ui/loader";
import { ConfirmDialog } from "../dialogs/Dialogs";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderLogo } from "./ProviderLogo";
import { modelDraftFromPreset, type CoreSettingsScope, type ProviderDraft } from "./types";
import { t } from "@lingzhu/ui/i18n";
import type { AppPreferences, ProviderPreset } from "@lingzhu/ui/types";

interface Props {
  scope: CoreSettingsScope;
  preferences: AppPreferences;
  onSavePreferences: (preferences: AppPreferences) => void;
}

type TestState = { tone: "busy" | "ok" | "error"; text: string };

interface DialogState {
  open: boolean;
  initial?: ProviderDraft;
  editingID?: string;
  autoRefresh?: boolean;
}

const POPULAR_LIMIT = 6;

/** Connected providers and the popular catalog, laid out like the reference page. */
export function ProvidersSection({ scope, preferences, onSavePreferences }: Props) {
  const draft = scope.draft;
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [disconnecting, setDisconnecting] = useState<ProviderDraft>();

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
    if (providers.length === 0) {
      scope.updateAndCommit({ providers, provider: "", model: "" });
      return;
    }
    if (draft.provider === id) {
      const fallback = fallbackSelection(providers);
      if (!fallback) return;
      scope.updateAndCommit({ providers, ...fallback });
      return;
    }
    scope.updateAndCommit({ providers });
  };

  const runTest = async (provider: ProviderDraft) => {
    setTests((prev) => ({ ...prev, [provider.id]: { tone: "busy", text: t("testing") } }));
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
        apiKey: preset.defaultApiKey ?? "",
        apiKeyEnv: preset.apiKeyEnv,
        apiKeySet: false,
        clearKey: false,
        ready: false,
        dynamicModels: preset.dynamicModels,
        models: (preset.models ?? []).map(modelDraftFromPreset),
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
    // A provider whose list comes from its endpoint, such as the local
    // gateway, is refreshed on open: its catalog changes per machine, and a
    // stored copy would hide the models the endpoint added since.
    setDialog({
      open: true,
      initial: provider,
      editingID: provider.id,
      autoRefresh: provider.dynamicModels === true,
    });
  };

  const syncModels = (provider: ProviderDraft) => {
    setDialog({ open: true, initial: provider, editingID: provider.id, autoRefresh: true });
  };

  const accountsFor = (providerID: string) => preferences.providerAccounts[providerID] ?? [];
  const activeAccount = (providerID: string) => {
    const active = preferences.activeProviderAccounts[providerID];
    return accountsFor(providerID).find((account) => account.id === active);
  };
  const saveAccounts = (providerID: string, list: AppPreferences["providerAccounts"][string]) => {
    onSavePreferences({
      ...preferences,
      providerAccounts: { ...preferences.providerAccounts, [providerID]: list },
    });
  };
  const activateAccount = (provider: ProviderDraft, account: { id: string; name: string; key: string }) => {
    onSavePreferences({
      ...preferences,
      activeProviderAccounts: { ...preferences.activeProviderAccounts, [provider.id]: account.id },
    });
    const providers = draft.providers.map((item) =>
      item.id === provider.id ? { ...item, apiKey: account.key, apiKeySet: true, clearKey: false } : item,
    );
    scope.updateAndCommit({ providers });
  };
  const addAccount = (provider: ProviderDraft) => {
    const name = window.prompt(t("accountNamePrompt"));
    if (!name?.trim()) return;
    const key = window.prompt(t("apiKeyPrompt"));
    if (!key?.trim()) return;
    const id = `acct_${Date.now().toString(36)}`;
    const list = [...accountsFor(provider.id), { id, name: name.trim(), key: key.trim() }];
    saveAccounts(provider.id, list);
    onSavePreferences({
      ...preferences,
      providerAccounts: { ...preferences.providerAccounts, [provider.id]: list },
      activeProviderAccounts: { ...preferences.activeProviderAccounts, [provider.id]: id },
    });
    const providers = draft.providers.map((item) =>
      item.id === provider.id ? { ...item, apiKey: key.trim(), apiKeySet: true, clearKey: false } : item,
    );
    scope.updateAndCommit({ providers });
  };
  const renameAccount = (provider: ProviderDraft) => {
    const account = activeAccount(provider.id);
    if (!account) return;
    const next = window.prompt(t("accountNamePrompt"), account.name);
    if (!next?.trim()) return;
    saveAccounts(
      provider.id,
      accountsFor(provider.id).map((item) => (item.id === account.id ? { ...item, name: next.trim() } : item)),
    );
  };
  const removeAccount = (provider: ProviderDraft) => {
    const account = activeAccount(provider.id);
    if (!account) return;
    saveAccounts(
      provider.id,
      accountsFor(provider.id).filter((item) => item.id !== account.id),
    );
    const active = { ...preferences.activeProviderAccounts };
    delete active[provider.id];
    onSavePreferences({ ...preferences, activeProviderAccounts: active });
  };

  const providerType = (provider: ProviderDraft) => {
    if (activeAccount(provider.id)) return t("account");
    if (provider.apiKeySet) return t("accountApiKey");
    if (provider.apiKeyEnv) return t("accountEnvironment");
    return provider.baseUrl ? t("accountConfig") : t("accountCustom");
  };

  const availablePresets = presets.filter((preset) => !draft.providers.some((provider) => provider.id === preset.id));
  const visiblePresets = showAll ? availablePresets : availablePresets.slice(0, POPULAR_LIMIT);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{t("connectedSection")}</h2>
        <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          {draft.providers.map((provider) => {
            const result = tests[provider.id];
            return (
              <div
                key={provider.id}
                className="group flex min-h-12 flex-wrap items-center gap-2.5 border-b-[0.5px] border-border-base py-2.5 last:border-0 sm:flex-nowrap"
              >
                <ProviderLogo id={provider.id} name={provider.name} className="size-4 shrink-0 text-icon-base" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                    {provider.name || provider.id}
                  </span>
                  <Badge>{providerType(provider)}</Badge>
                  {provider.id === draft.provider && <Badge variant="secondary">{t("accountDefault")}</Badge>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="shrink-0 gap-1.5 text-text-muted hover:text-text-base">
                      <span className="max-w-40 truncate">{activeAccount(provider.id)?.name ?? t("account")}</span>
                      <ChevronDown className="size-3.5 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="end" className="w-48">
                    <DropdownMenuLabel>{t("accounts")}</DropdownMenuLabel>
                    {accountsFor(provider.id).map((account) => (
                      <DropdownMenuItem key={account.id} onSelect={() => activateAccount(provider, account)}>
                        {preferences.activeProviderAccounts[provider.id] === account.id ? (
                          <Check />
                        ) : (
                          <span className="size-3.5" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{account.name}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={() => addAccount(provider)}>
                      <Plus />
                      {t("addAccount")}
                    </DropdownMenuItem>
                    {activeAccount(provider.id) && (
                      <DropdownMenuItem onSelect={() => renameAccount(provider)}>{t("renameAccount")}</DropdownMenuItem>
                    )}
                    {activeAccount(provider.id) && (
                      <DropdownMenuItem destructive onSelect={() => removeAccount(provider)}>
                        {t("removeAccount")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => openEdit(provider)}>
                      <Pencil />
                      {t("editAction")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void runTest(provider)}>
                      {result?.tone === "busy" ? <Loader /> : <CircleAlert />}
                      {t("testAction")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => syncModels(provider)}>
                      <RefreshCw />
                      {t("syncModels")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setDisconnecting(provider)}>
                      <Unplug />
                      {t("disconnectAction")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {result && result.tone !== "busy" && (
                  <p
                    role="status"
                    className={`w-full text-caption leading-4 ${
                      result.tone === "ok" ? "text-state-fg-success" : "text-state-fg-danger"
                    }`}
                  >
                    {result.text}
                  </p>
                )}
              </div>
            );
          })}
          {draft.providers.length === 0 && (
            <p className="py-5 text-body font-[440] leading-4 text-text-muted">{t("noProvidersConnected")}</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{t("popularSection")}</h2>
        <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          {visiblePresets.map((preset) => (
            <div
              key={preset.id}
              className="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-4 border-b-[0.5px] border-border-base py-5 last:border-0 sm:flex-nowrap"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <ProviderLogo id={preset.id} name={preset.name} className="mt-0.5 size-4 shrink-0 text-icon-base" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                    {preset.name}
                  </span>
                  <p className="m-0 text-body font-[440] leading-5 text-text-muted">
                    {preset.dynamicModels ? t("modelsFromEndpoint") : t("modelsCount", { count: preset.models?.length ?? 0 })}
                  </p>
                </div>
              </div>
              <Button type="button" variant="neutral" size="sm" onClick={() => openPreset(preset)} className="shrink-0 gap-2">
                <Plus className="size-4" />
                {t("connectAction")}
              </Button>
            </div>
          ))}
          {availablePresets.length === 0 && (
            <p className="py-5 text-body font-[440] leading-4 text-text-muted">
              {presets.length === 0 ? t("loadingProviders") : t("allProvidersConnected")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {availablePresets.length > POPULAR_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="text-body font-[530] leading-4 text-text-accent hover:text-text-accent/80"
            >
              {showAll ? t("showFewerProviders") : t("seeAllProviders")}
            </button>
          )}
          <button
            type="button"
            onClick={openCustom}
            className="text-body font-[440] leading-4 text-text-muted hover:text-text-base"
          >
            {t("customEndpoint")}
          </button>
        </div>
      </section>

      <ProviderDialog
        open={dialog.open}
        initial={dialog.initial}
        editingID={dialog.editingID}
        existingIDs={draft.providers.map((provider) => provider.id)}
        busy={scope.busy}
        advanced
        autoRefresh={dialog.autoRefresh}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onSave={saveProvider}
      />

      <ConfirmDialog
        open={!!disconnecting}
        title={t("disconnectTitle")}
        description={disconnecting ? t("disconnectDesc", { name: disconnecting.name || disconnecting.id }) : ""}
        confirmLabel={t("disconnectAction")}
        destructive
        onOpenChange={(open) => !open && setDisconnecting(undefined)}
        onConfirm={() => {
          if (disconnecting) removeProvider(disconnecting.id);
          setDisconnecting(undefined);
        }}
      />
    </div>
  );
}
