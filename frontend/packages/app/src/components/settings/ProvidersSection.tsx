import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function ProvidersSection(props: Props) {
  const draft = () => props.scope.draft;
  const [presets, setPresets] = createSignal<ProviderPreset[]>([]);
  const [tests, setTests] = createSignal<Record<string, TestState>>({});
  const [showAll, setShowAll] = createSignal(false);
  const [dialog, setDialog] = createSignal<DialogState>({ open: false });
  const [disconnecting, setDisconnecting] = createSignal<ProviderDraft>();

  onMount(() => {
    let alive = true;
    api
      .presets()
      .then((value) => {
        if (alive) setPresets(value);
      })
      .catch(() => undefined);
    onCleanup(() => {
      alive = false;
    });
  });

  const fallbackSelection = (providers: ProviderDraft[]) => {
    const withModels = providers.filter((provider) => provider.models.length > 0);
    const target = withModels.find((provider) => provider.ready) ?? withModels[0];
    return target ? { provider: target.id, model: target.models[0].id } : undefined;
  };

  const saveProvider = (provider: ProviderDraft) => {
    const editingID = dialog().editingID;
    const current = draft();
    let providers: ProviderDraft[];
    if (editingID !== undefined) {
      providers = current.providers.map((item) => (item.id === editingID ? provider : item));
    } else {
      providers = [...current.providers, provider];
    }
    const target = providers.find((item) => item.id === current.provider);
    if (target && !target.models.some((model) => model.id === current.model)) {
      const fallback = fallbackSelection(providers);
      props.scope.updateAndCommit({ providers, ...(fallback ?? { model: target.models[0]?.id ?? "" }) });
    } else {
      props.scope.updateAndCommit({ providers });
    }
    setDialog({ open: false });
  };

  const removeProvider = (id: string) => {
    const current = draft();
    const providers = current.providers.filter((provider) => provider.id !== id);
    if (providers.length === 0) {
      props.scope.updateAndCommit({ providers, provider: "", model: "" });
      return;
    }
    if (current.provider === id) {
      const fallback = fallbackSelection(providers);
      if (!fallback) return;
      props.scope.updateAndCommit({ providers, ...fallback });
      return;
    }
    props.scope.updateAndCommit({ providers });
  };

  const runTest = async (provider: ProviderDraft) => {
    update(setTests, tests, (prev) => ({ ...prev, [provider.id]: { tone: "busy" as const, text: t("testing") } }));
    try {
      const message = await api.testProvider(provider.id, provider.baseUrl, "", provider.apiKeyEnv);
      update(setTests, tests, (prev) => ({ ...prev, [provider.id]: { tone: "ok" as const, text: message } }));
    } catch (error) {
      update(setTests, tests, (prev) => ({
        ...prev,
        [provider.id]: { tone: "error" as const, text: messageOf(error) },
      }));
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

  const accountsFor = (providerID: string) => props.preferences.providerAccounts[providerID] ?? [];
  const activeAccount = (providerID: string) => {
    const active = props.preferences.activeProviderAccounts[providerID];
    return accountsFor(providerID).find((account) => account.id === active);
  };
  const saveAccounts = (providerID: string, list: AppPreferences["providerAccounts"][string]) => {
    props.onSavePreferences({
      ...props.preferences,
      providerAccounts: { ...props.preferences.providerAccounts, [providerID]: list },
    });
  };
  const activateAccount = (provider: ProviderDraft, account: { id: string; name: string; key: string }) => {
    props.onSavePreferences({
      ...props.preferences,
      activeProviderAccounts: { ...props.preferences.activeProviderAccounts, [provider.id]: account.id },
    });
    const providers = draft().providers.map((item) =>
      item.id === provider.id ? { ...item, apiKey: account.key, apiKeySet: true, clearKey: false } : item,
    );
    props.scope.updateAndCommit({ providers });
  };
  const addAccount = (provider: ProviderDraft) => {
    const name = window.prompt(t("accountNamePrompt"));
    if (!name?.trim()) return;
    const key = window.prompt(t("apiKeyPrompt"));
    if (!key?.trim()) return;
    const id = `acct_${Date.now().toString(36)}`;
    const list = [...accountsFor(provider.id), { id, name: name.trim(), key: key.trim() }];
    saveAccounts(provider.id, list);
    props.onSavePreferences({
      ...props.preferences,
      providerAccounts: { ...props.preferences.providerAccounts, [provider.id]: list },
      activeProviderAccounts: { ...props.preferences.activeProviderAccounts, [provider.id]: id },
    });
    const providers = draft().providers.map((item) =>
      item.id === provider.id ? { ...item, apiKey: key.trim(), apiKeySet: true, clearKey: false } : item,
    );
    props.scope.updateAndCommit({ providers });
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
    const active = { ...props.preferences.activeProviderAccounts };
    delete active[provider.id];
    props.onSavePreferences({ ...props.preferences, activeProviderAccounts: active });
  };

  const providerType = (provider: ProviderDraft) => {
    if (activeAccount(provider.id)) return t("account");
    if (provider.apiKeySet) return t("accountApiKey");
    if (provider.apiKeyEnv) return t("accountEnvironment");
    return provider.baseUrl ? t("accountConfig") : t("accountCustom");
  };

  const availablePresets = createMemo(() =>
    presets().filter((preset) => !draft().providers.some((provider) => provider.id === preset.id)),
  );
  const visiblePresets = createMemo(() =>
    showAll() ? availablePresets() : availablePresets().slice(0, POPULAR_LIMIT),
  );

  return (
    <div class="flex flex-col gap-8">
      <section class="flex flex-col gap-4">
        <h2 class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{t("connectedSection")}</h2>
        <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          <For each={draft().providers}>
            {(provider) => {
              const result = () => tests()[provider.id];
              return (
                <div class="group flex min-h-12 flex-wrap items-center gap-2.5 border-b-[0.5px] border-border-base py-2.5 last:border-0 sm:flex-nowrap">
                  <ProviderLogo id={provider.id} name={provider.name} class="size-4 shrink-0 text-icon-base" />
                  <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span class="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                      {provider.name || provider.id}
                    </span>
                    <Badge>{providerType(provider)}</Badge>
                    <Show when={provider.id === draft().provider}>
                      <Badge variant="secondary">{t("accountDefault")}</Badge>
                    </Show>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      variant="ghost"
                      size="sm"
                      class="shrink-0 gap-1.5 text-text-muted hover:text-text-base"
                      as={Button}
                    >
                      <span class="max-w-40 truncate">{activeAccount(provider.id)?.name ?? t("account")}</span>
                      <ChevronDown class="size-3.5 shrink-0" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="end" class="w-48">
                      <DropdownMenuLabel>{t("accounts")}</DropdownMenuLabel>
                      <For each={accountsFor(provider.id)}>
                        {(account) => (
                          <DropdownMenuItem onSelect={() => activateAccount(provider, account)}>
                            <Show
                              when={props.preferences.activeProviderAccounts[provider.id] === account.id}
                              fallback={<span class="size-3.5" />}
                            >
                              <Check />
                            </Show>
                            <span class="min-w-0 flex-1 truncate">{account.name}</span>
                          </DropdownMenuItem>
                        )}
                      </For>
                      <DropdownMenuItem onSelect={() => addAccount(provider)}>
                        <Plus />
                        {t("addAccount")}
                      </DropdownMenuItem>
                      <Show when={activeAccount(provider.id)}>
                        <DropdownMenuItem onSelect={() => renameAccount(provider)}>{t("renameAccount")}</DropdownMenuItem>
                      </Show>
                      <Show when={activeAccount(provider.id)}>
                        <DropdownMenuItem destructive onSelect={() => removeAccount(provider)}>
                          {t("removeAccount")}
                        </DropdownMenuItem>
                      </Show>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openEdit(provider)}>
                        <Pencil />
                        {t("editAction")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void runTest(provider)}>
                        <Show when={result()?.tone === "busy"} fallback={<CircleAlert />}>
                          <Loader />
                        </Show>
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
                  <Show when={result() && result()!.tone !== "busy"}>
                    <p
                      role="status"
                      class={`w-full text-caption leading-4 ${
                        result()!.tone === "ok" ? "text-state-fg-success" : "text-state-fg-danger"
                      }`}
                    >
                      {result()!.text}
                    </p>
                  </Show>
                </div>
              );
            }}
          </For>
          <Show when={draft().providers.length === 0}>
            <p class="py-5 text-body font-[440] leading-4 text-text-muted">{t("noProvidersConnected")}</p>
          </Show>
        </div>
      </section>

      <section class="flex flex-col gap-4">
        <h2 class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{t("popularSection")}</h2>
        <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          <For each={visiblePresets()}>
            {(preset) => (
              <div class="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-4 border-b-[0.5px] border-border-base py-5 last:border-0 sm:flex-nowrap">
                <div class="flex min-w-0 flex-1 items-start gap-2.5">
                  <ProviderLogo id={preset.id} name={preset.name} class="mt-0.5 size-4 shrink-0 text-icon-base" />
                  <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span class="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                      {preset.name}
                    </span>
                    <p class="m-0 text-body font-[440] leading-5 text-text-muted">
                      {preset.dynamicModels
                        ? t("modelsFromEndpoint")
                        : t("modelsCount", { count: preset.models?.length ?? 0 })}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={() => openPreset(preset)}
                  class="shrink-0 gap-2"
                >
                  <Plus class="size-4" />
                  {t("connectAction")}
                </Button>
              </div>
            )}
          </For>
          <Show when={availablePresets().length === 0}>
            <p class="py-5 text-body font-[440] leading-4 text-text-muted">
              {presets().length === 0 ? t("loadingProviders") : t("allProvidersConnected")}
            </p>
          </Show>
        </div>
        <div class="flex items-center gap-4">
          <Show when={availablePresets().length > POPULAR_LIMIT}>
            <button
              type="button"
              onClick={() => update(setShowAll, showAll, (value) => !value)}
              class="text-body font-[530] leading-4 text-text-accent hover:text-text-accent/80"
            >
              {showAll() ? t("showFewerProviders") : t("seeAllProviders")}
            </button>
          </Show>
          <button
            type="button"
            onClick={openCustom}
            class="text-body font-[440] leading-4 text-text-muted hover:text-text-base"
          >
            {t("customEndpoint")}
          </button>
        </div>
      </section>

      <ProviderDialog
        open={dialog().open}
        initial={dialog().initial}
        editingID={dialog().editingID}
        existingIDs={draft().providers.map((provider) => provider.id)}
        busy={props.scope.busy}
        advanced
        autoRefresh={dialog().autoRefresh}
        onOpenChange={(open) => update(setDialog, dialog, (current) => ({ ...current, open }))}
        onSave={saveProvider}
      />

      <ConfirmDialog
        open={!!disconnecting()}
        title={t("disconnectTitle")}
        description={
          disconnecting() ? t("disconnectDesc", { name: disconnecting()!.name || disconnecting()!.id }) : ""
        }
        confirmLabel={t("disconnectAction")}
        destructive
        onOpenChange={(open) => !open && setDisconnecting(undefined)}
        onConfirm={() => {
          const target = disconnecting();
          if (target) removeProvider(target.id);
          setDisconnecting(undefined);
        }}
      />
    </div>
  );
}
