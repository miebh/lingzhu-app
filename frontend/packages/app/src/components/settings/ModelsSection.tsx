import { createMemo, createSignal, For, Show } from "solid-js";
import { ChevronDown, Ellipsis, Search } from "@lingzhu/ui/icons";
import { Input } from "@lingzhu/ui/input";
import { Switch } from "@lingzhu/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Button } from "@lingzhu/ui/button";
import { update } from "@lingzhu/ui/solid";
import { ProviderLogo } from "./ProviderLogo";
import { SettingsRow } from "./primitives";
import { t } from "@lingzhu/ui/i18n";
import type { AppPreferences, ProviderSettings } from "@lingzhu/ui/types";

const modelKey = (providerID: string, modelID: string) => `${providerID}\u0000${modelID}`;

/**
 * Models page: provider groups whose headers sit outside the row card, each
 * model carrying only a visibility switch. The switches edit the local
 * preference the picker reads, so they never rewrite the core config.
 */
export function ModelsSection(props: {
  providers: ProviderSettings[];
  preferences: AppPreferences;
  onSavePreferences: (preferences: AppPreferences) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const needle = createMemo(() => query().trim().toLowerCase());

  const hidden = createMemo(
    () => new Set(props.preferences.hiddenModels.map((item) => modelKey(item.provider, item.model))),
  );

  const shown = (providerID: string, modelID: string) => !hidden().has(modelKey(providerID, modelID));

  const setModelsVisible = (providerID: string, modelIDs: string[], visible: boolean) => {
    const next = new Map(
      props.preferences.hiddenModels.map((item) => [modelKey(item.provider, item.model), item]),
    );
    for (const modelID of modelIDs) {
      const key = modelKey(providerID, modelID);
      if (visible) next.delete(key);
      else next.set(key, { provider: providerID, model: modelID });
    }
    props.onSavePreferences({ ...props.preferences, hiddenModels: [...next.values()] });
  };

  const groups = createMemo(() =>
    props.providers
      .map((provider) => ({
        provider,
        models: provider.models.filter(
          (model) =>
            !needle() ||
            model.id.toLowerCase().includes(needle()) ||
            model.name.toLowerCase().includes(needle()) ||
            provider.name.toLowerCase().includes(needle()) ||
            provider.id.toLowerCase().includes(needle()),
        ),
      }))
      .filter((group) => group.models.length > 0),
  );

  const total = () => props.providers.reduce((count, provider) => count + provider.models.length, 0);

  return (
    <div class="flex flex-col gap-6">
      <div class="relative">
        <Search class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
        <Input
          value={query()}
          aria-label={t("searchModels")}
          placeholder={t("searchModels")}
          spellcheck={false}
          autocomplete="off"
          onInput={(event) => setQuery(event.currentTarget.value)}
          class="h-9 rounded-[6px] bg-bg-layer-02/60 ps-10 pe-3 hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02"
        />
      </div>

      <For each={groups()}>
        {(group) => {
          const isCollapsed = () => !needle() && collapsed()[group.provider.id] === true;
          return (
            <section class="flex min-w-0 flex-col gap-3">
              <div class="flex h-7 min-w-0 items-center gap-2">
                <button
                  type="button"
                  aria-expanded={!isCollapsed()}
                  onClick={() =>
                    update(setCollapsed, collapsed, (prev) => ({
                      ...prev,
                      [group.provider.id]: !isCollapsed(),
                    }))
                  }
                  class="interactive flex h-7 min-w-0 flex-1 items-center gap-1 rounded-xs px-1 text-left hover:bg-bg-layer-02"
                >
                  <ChevronDown
                    class={`size-4 shrink-0 text-icon-faint transition-transform duration-150 ${isCollapsed() ? "-rotate-90" : ""}`}
                  />
                  <ProviderLogo
                    id={group.provider.id}
                    name={group.provider.name}
                    class="size-4 shrink-0 text-icon-muted"
                  />
                  <span class="min-w-0 flex-1 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                    {group.provider.name || group.provider.id}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("projectActions", { name: group.provider.name || group.provider.id })}
                    class="shrink-0 text-icon-faint hover:text-text-base"
                    as={Button}
                  >
                    <Ellipsis />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        setModelsVisible(group.provider.id, group.provider.models.map((model) => model.id), true)
                      }
                    >
                      {t("enableAll")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        setModelsVisible(group.provider.id, group.provider.models.map((model) => model.id), false)
                      }
                    >
                      {t("disableAll")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Show when={!isCollapsed()}>
                <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
                  <For each={group.models}>
                    {(model) => (
                      <SettingsRow title={model.name || model.id} catalog>
                        <Switch
                          aria-label={t("showCategory", { name: model.name || model.id })}
                          checked={shown(group.provider.id, model.id)}
                          onCheckedChange={(checked) => setModelsVisible(group.provider.id, [model.id], checked)}
                        />
                      </SettingsRow>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          );
        }}
      </For>

      <Show when={groups().length === 0}>
        <p class="py-6 text-center text-meta text-text-faint">
          {total() === 0 ? t("noModelsYet") : t("noModelsMatch")}
        </p>
      </Show>
    </div>
  );
}
