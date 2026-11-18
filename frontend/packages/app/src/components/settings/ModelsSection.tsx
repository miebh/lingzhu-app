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
import type { AppPreferences, ProviderSettings } from "@lingzhu/ui/types";

const modelKey = (providerID: string, modelID: string) => `${providerID}\u0000${modelID}`;

/**
 * Models page: provider groups whose headers sit outside the row card, each
 * model carrying only a visibility switch. The switches edit the local
 * preference the picker reads, so they never rewrite the core config.
 */
export function ModelsSection({
  providers,
  preferences,
  onSavePreferences,
}: {
  providers: ProviderSettings[];
  preferences: AppPreferences;
  onSavePreferences: (preferences: AppPreferences) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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
    onSavePreferences({ ...preferences, hiddenModels: [...next.values()] });
  };

  const groups = useMemo(
    () =>
      providers
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
    [providers, needle],
  );

  const total = providers.reduce((count, provider) => count + provider.models.length, 0);

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

            {!isCollapsed && (
              <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
                {group.models.map((model) => (
                  <SettingsRow key={`${group.provider.id}:${model.id}`} title={model.name || model.id} catalog>
                    <Switch
                      aria-label={t("showCategory", { name: model.name || model.id })}
                      checked={shown(group.provider.id, model.id)}
                      onCheckedChange={(checked) => setModelsVisible(group.provider.id, [model.id], checked)}
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
