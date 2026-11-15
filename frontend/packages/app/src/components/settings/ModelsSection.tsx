import { useMemo, useState } from "react";
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
import { ProviderLogo } from "./ProviderLogo";
import { SettingsRow } from "./primitives";
import { t } from "@lingzhu/ui/i18n";
import type { CoreSettingsScope } from "./types";

/**
 * Models page: provider groups whose headers sit outside the row card, each
 * model carrying only a visibility switch, matching the reference catalog.
 */
export function ModelsSection({
  scope,
}: {
  scope: CoreSettingsScope;
  onAddProvider: () => void;
}) {
  const draft = scope.draft;
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const needle = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      draft.providers
        .map((provider) => ({
          provider,
          models: provider.models.filter(
            (model) =>
              !needle ||
              model.id.toLowerCase().includes(needle) ||
              model.name.toLowerCase().includes(needle) ||
              provider.name.toLowerCase().includes(needle) ||
              provider.id.toLowerCase().includes(needle),
          ),
        }))
        .filter((group) => group.models.length > 0),
    [draft.providers, needle],
  );

  const total = draft.providers.reduce((count, provider) => count + provider.models.length, 0);

  const toggleModel = (providerID: string, modelID: string, enabled: boolean) => {
    const providers = draft.providers.map((provider) =>
      provider.id !== providerID
        ? provider
        : {
            ...provider,
            models: provider.models.map((model) => (model.id === modelID ? { ...model, enabled } : model)),
          },
    );
    let selection: Partial<CoreSettingsScope["draft"]> = {};
    if (!enabled && draft.provider === providerID && draft.model === modelID) {
      const enabledModels = providers.flatMap((provider) =>
        provider.models
          .filter((model) => model.enabled !== false)
          .map((model) => ({ provider: provider.id, model: model.id, ready: provider.ready })),
      );
      const next = enabledModels.find((item) => item.ready) ?? enabledModels[0];
      if (next) selection = { provider: next.provider, model: next.model };
    }
    scope.updateAndCommit({ providers, ...selection });
  };

  const setProviderEnabled = (providerID: string, enabled: boolean) => {
    const providers = draft.providers.map((provider) =>
      provider.id !== providerID
        ? provider
        : {
            ...provider,
            models: provider.models.map((model) => ({ ...model, enabled })),
          },
    );
    let selection: Partial<CoreSettingsScope["draft"]> = {};
    const current = providers.find((provider) => provider.id === draft.provider);
    if (!enabled && current && current.models.some((model) => model.id === draft.model)) {
      const candidates = providers.flatMap((provider) =>
        provider.models
          .filter((model) => model.enabled !== false)
          .map((model) => ({ provider: provider.id, model: model.id, ready: provider.ready })),
      );
      const next = candidates.find((item) => item.ready) ?? candidates[0];
      if (next) selection = { provider: next.provider, model: next.model };
    }
    scope.updateAndCommit({ providers, ...selection });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
        <Input
          value={query}
          aria-label={t("searchModels")}
          placeholder={t("searchModels")}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 rounded-[6px] bg-bg-layer-02/60 ps-10 pe-3 hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02"
        />
      </div>

      {groups.map((group) => {
        const isCollapsed = !needle && collapsed[group.provider.id] === true;
        return (
          <section key={group.provider.id} className="flex min-w-0 flex-col gap-3">
            <div className="flex h-7 min-w-0 items-center gap-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.provider.id]: !isCollapsed }))}
                className="interactive flex h-7 min-w-0 flex-1 items-center gap-1 rounded-xs px-1 text-left hover:bg-bg-layer-02"
              >
                <ChevronDown
                  className={`size-4 shrink-0 text-icon-faint transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`}
                />
                <ProviderLogo id={group.provider.id} name={group.provider.name} className="size-4 shrink-0 text-icon-muted" />
                <span className="min-w-0 flex-1 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                  {group.provider.name || group.provider.id}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("projectActions", { name: group.provider.name || group.provider.id })}
                    className="shrink-0 text-icon-faint hover:text-text-base"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end">
                  <DropdownMenuItem onSelect={() => setProviderEnabled(group.provider.id, true)}>
                    {t("enableAll")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setProviderEnabled(group.provider.id, false)}>
                    {t("disableAll")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {!isCollapsed && (
              <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
                {group.models.map((model) => (
                  <SettingsRow key={`${group.provider.id}:${model.id}`} title={model.name || model.id} catalog>
                    <Switch
                      aria-label={t("showCategory", { name: model.name || model.id })}
                      checked={model.enabled !== false}
                      onCheckedChange={(checked) => toggleModel(group.provider.id, model.id, checked)}
                    />
                  </SettingsRow>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {groups.length === 0 && (
        <p className="py-6 text-center text-meta text-text-faint">
          {total === 0 ? t("noModelsYet") : t("noModelsMatch")}
        </p>
      )}
    </div>
  );
}
