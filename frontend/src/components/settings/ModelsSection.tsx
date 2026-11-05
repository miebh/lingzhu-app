import { useMemo, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderLogo } from "./ProviderLogo";
import { SettingsSection } from "./primitives";
import type { CoreSettingsScope, ModelDraft, ProviderDraft } from "./types";

/**
 * Models page: grouped catalog with the default selection at the top. Each
 * provider's edit action reuses the Providers connect dialog to add models.
 */
export function ModelsSection({
  scope,
  onAddProvider,
}: {
  scope: CoreSettingsScope;
  onAddProvider: () => void;
}) {
  const draft = scope.draft;
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<ProviderDraft>();
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
  const selectedProvider = draft.providers.find((provider) => provider.id === draft.provider);
  const selectedModel = selectedProvider?.models.find((model) => model.id === draft.model);
  const label = selectedProvider
    ? `${selectedProvider.name || selectedProvider.id} / ${selectedModel?.name || selectedModel?.id || draft.model}`
    : draft.model || "No model selected";

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

  // Edits arrive from the provider dialog, which is also how models get added.
  const saveProvider = (provider: ProviderDraft) => {
    const providers = draft.providers.map((item) => (item.id === provider.id ? provider : item));
    let selection: Partial<CoreSettingsScope["draft"]> = {};
    const target = providers.find((item) => item.id === draft.provider);
    if (target && !target.models.some((model) => model.id === draft.model)) {
      const candidates = providers.flatMap((item) =>
        item.models
          .filter((model) => model.enabled !== false)
          .map((model) => ({ provider: item.id, model: model.id, ready: item.ready })),
      );
      const next = candidates.find((item) => item.ready) ?? candidates[0];
      if (next) selection = { provider: next.provider, model: next.model };
    }
    scope.updateAndCommit({ providers, ...selection });
    setEditing(undefined);
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Default model"
        description="New sessions and sessions without an override use this model."
      >
        <div className="flex flex-wrap items-center gap-3 py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-full gap-2 font-normal">
                <span className="truncate">{label}</span>
                <ChevronDown className="size-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start" className="max-h-80 min-w-64 overflow-y-auto">
              {draft.providers.map((provider, index) => (
                <div key={provider.id}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="flex items-center justify-between gap-2 text-caption text-text-faint">
                    <span className="truncate">{provider.name || provider.id}</span>
                    {!provider.ready && <span className="shrink-0 text-state-fg-warning">No API key</span>}
                  </DropdownMenuLabel>
                  {provider.models.filter((model) => model.enabled !== false).map((model) => {
                    const active = provider.id === draft.provider && model.id === draft.model;
                    return (
                      <DropdownMenuItem
                        key={`${provider.id}:${model.id}`}
                        disabled={!provider.ready}
                        onSelect={() => scope.updateAndCommit({ provider: provider.id, model: model.id })}
                      >
                        <span className="min-w-0 flex-1 truncate">{model.name || model.id}</span>
                        {active && <Check className="size-3.5 shrink-0 text-text-accent" />}
                      </DropdownMenuItem>
                    );
                  })}
                  {provider.models.length === 0 && <DropdownMenuItem disabled>No models</DropdownMenuItem>}
                </div>
              ))}
              {draft.providers.length === 0 && <DropdownMenuItem disabled>No providers</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedProvider && !selectedProvider.ready && (
            <span className="text-caption text-state-fg-warning">Selected provider has no API key.</span>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Models"
        description={`${total} models across ${draft.providers.length} providers. Select one to use it as the default.`}
      >
        <div className="relative pt-4">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-text-faint" />
          <Input
            size="sm"
            value={query}
            aria-label="Search models"
            placeholder="Search models or providers"
            onChange={(event) => setQuery(event.target.value)}
            className="pl-6 select-text"
          />
        </div>

        <div className="flex flex-col pt-2">
          {groups.map((group) => (
            <div key={group.provider.id} className="border-b-[0.5px] border-border-base py-4 last:border-0">
              {(() => {
                const isCollapsed = !needle && collapsed[group.provider.id] === true;
                return (
                  <>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() => setCollapsed((prev) => ({ ...prev, [group.provider.id]: !isCollapsed }))}
                        className="interactive flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left"
                      >
                        <ChevronDown
                          className={`size-3 shrink-0 text-text-faint transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                        />
                        <ProviderLogo id={group.provider.id} name={group.provider.name} className="size-4 shrink-0 text-text-muted" />
                        <span className="min-w-0 flex-1 truncate text-body font-medium text-text-base">
                          {group.provider.name || group.provider.id}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-caption text-text-faint">
                          <span
                            className={`size-1.5 rounded-full ${
                              group.provider.ready ? "bg-state-fg-success" : "bg-state-fg-warning"
                            }`}
                          />
                          {group.provider.ready ? "Ready" : "No key"}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Edit ${group.provider.name || group.provider.id}`}
                        onClick={() => setEditing(group.provider)}
                        className="shrink-0 text-text-faint hover:text-text-base"
                      >
                        <Pencil />
                      </Button>
                    </div>
                    {!isCollapsed && group.models.map((model) => {
                      const active = group.provider.id === draft.provider && model.id === draft.model;
                      return (
                        <div key={`${group.provider.id}:${model.id}`} className="flex items-center gap-2">
                          <button
                            type="button"
                            title={modelMetaTitle(model)}
                            disabled={!group.provider.ready || model.enabled === false}
                            onClick={() => scope.updateAndCommit({ provider: group.provider.id, model: model.id })}
                            className="interactive flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="grid size-control-xs shrink-0 place-items-center">
                              {active ? (
                                <Check className="size-3.5 text-text-accent" />
                              ) : (
                                <span className="size-1.5 rounded-full bg-border-strong" />
                              )}
                            </span>
                            <span
                              className={`min-w-0 flex-1 truncate text-body ${
                                model.enabled === false ? "text-text-faint" : "text-text-base"
                              }`}
                            >
                              {model.name || model.id}
                            </span>
                            <span className="hidden min-w-0 max-w-48 truncate font-mono text-caption text-text-faint sm:block">
                              {model.id}
                            </span>
                            <span className="w-20 shrink-0 text-right text-caption tabular-nums text-text-faint">
                              {windowLabel(Number(model.contextWindow))}
                              {model.maxOutputTokens ? ` / ${windowLabel(Number(model.maxOutputTokens))}` : ""}
                            </span>
                          </button>
                          <Switch
                            aria-label={`Show ${model.name || model.id}`}
                            checked={model.enabled !== false}
                            onCheckedChange={(checked) => toggleModel(group.provider.id, model.id, checked)}
                          />
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="py-6 text-center text-meta text-text-faint">
              {total === 0 ? "No models yet. Add them from a provider." : "No models match this search."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t-[0.5px] border-border-base py-4">
          <span className="text-meta text-text-faint">Providers supply the models in this catalog.</span>
          <Button type="button" variant="outline" size="xs" onClick={onAddProvider} className="shrink-0">
            <Plus />
            Add provider
          </Button>
        </div>
      </SettingsSection>

      <ProviderDialog
        open={editing !== undefined}
        initial={editing}
        editingID={editing?.id}
        existingIDs={draft.providers.map((provider) => provider.id)}
        busy={scope.busy}
        advanced
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        onSave={saveProvider}
      />
    </div>
  );
}

function modelMetaTitle(model: ModelDraft): string {
  const parts: string[] = [];
  if (model.inputCost || model.outputCost) {
    parts.push(`$${model.inputCost || "0"} in / $${model.outputCost || "0"} out per M tokens`);
  }
  if (model.reasoning) parts.push("reasoning");
  if (model.attachment) parts.push("vision");
  if (model.toolCall === false) parts.push("no tools");
  return parts.join(" · ");
}

function windowLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "off";
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}
