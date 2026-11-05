import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, SlidersHorizontal, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { modelLabel, modelVariantID, splitModelID } from "../lib/models";
import type { ModelSelection, ModelSettings, ProviderSettings } from "../lib/types";
import { usePreferences, usePreferencesStore } from "../store/preferences";

interface Props {
  providers: ProviderSettings[];
  provider: string;
  model: string;
  onSelect: (providerID: string, modelID: string) => void;
  onManageModels: () => void;
  onAddProvider: () => void;
}

interface Row {
  key: string;
  provider: ProviderSettings;
  model: ModelSettings;
  variant?: string;
  /** Selectable id: the base model id or a variant alias. */
  id: string;
}

interface Section {
  key: string;
  title: string;
  rows: Row[];
}

const optionKey = (providerID: string, modelID: string) => `${providerID}\u0000${modelID}`;

const sameSelection = (a: ModelSelection, providerID: string, modelID: string) =>
  a.provider === providerID && a.model === modelID;

/** Base rows first, then one row per variant, each resolving to the same wire model. */
function rowsFor(provider: ProviderSettings): Row[] {
  const blocked = new Set(provider.blacklist ?? []);
  const allowed = new Set(provider.whitelist ?? []);
  return provider.models.flatMap((model) => {
    if (model.enabled === false || blocked.has(model.id)) return [];
    if (allowed.size > 0 && !allowed.has(model.id)) return [];
    const base: Row = {
      key: optionKey(provider.id, model.id),
      provider,
      model,
      id: model.id,
    };
    const variants = Object.keys(model.variants ?? {})
      .sort((a, b) => a.localeCompare(b))
      .map((variant) => ({
        key: optionKey(provider.id, modelVariantID(model.id, variant)),
        provider,
        model,
        variant,
        id: modelVariantID(model.id, variant),
      }));
    return [base, ...variants];
  });
}

function matches(row: Row, term: string) {
  if (!term) return true;
  const label = modelLabel(row.model, row.variant).toLowerCase();
  return (
    row.provider.name.toLowerCase().includes(term) ||
    row.provider.id.toLowerCase().includes(term) ||
    row.model.name.toLowerCase().includes(term) ||
    row.model.id.toLowerCase().includes(term) ||
    label.includes(term)
  );
}

/**
 * The model chip opens a searchable command-style dialog. Favorites and recents
 * lead the list; variants sit under their base model as selectable rows.
 */
export function ModelPicker({ providers, provider, model, onSelect, onManageModels, onAddProvider }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string>();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const preferences = usePreferences();
  const savePreferences = usePreferencesStore((state) => state.save);

  const current = splitModelID(model);
  const selectedProvider = providers.find((item) => item.id === provider);
  const selectedModel = selectedProvider?.models.find((item) => item.id === current.model);
  const label = selectedModel ? modelLabel(selectedModel, current.variant) : model || "Default model";

  const allRows = useMemo(() => new Map(providers.map((item) => [item.id, rowsFor(item)])), [providers]);

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    return providers
      .map((item) => ({ provider: item, rows: (allRows.get(item.id) ?? []).filter((row) => matches(row, term)) }))
      .filter((group) => group.rows.length > 0);
  }, [allRows, providers, query]);

  const pick = (selection: ModelSelection): Row | undefined => {
    const provider = providers.find((item) => item.id === selection.provider);
    return provider ? (allRows.get(provider.id) ?? []).find((row) => row.id === selection.model) : undefined;
  };

  const listed = useMemo(() => {
    const term = query.trim();
    if (term) return new Set<string>();
    return new Set(
      [...preferences.favoriteModels, ...preferences.recentModels]
        .map((selection) => pick(selection)?.key)
        .filter((key): key is string => !!key),
    );
  }, [allRows, preferences.favoriteModels, preferences.recentModels, providers, query]);

  const sections = useMemo((): Section[] => {
    if (query.trim()) {
      return groups.map((group) => ({ key: group.provider.id, title: group.provider.name, rows: group.rows }));
    }
    const favorites = preferences.favoriteModels
      .map(pick)
      .filter((row): row is Row => !!row);
    const favoriteKeys = new Set(favorites.map((row) => row.key));
    const recent = preferences.recentModels
      .map(pick)
      .filter((row): row is Row => !!row && !favoriteKeys.has(row.key));
    return [
      ...(favorites.length > 0 ? [{ key: "section:favorites", title: "Favorites", rows: favorites }] : []),
      ...(recent.length > 0 ? [{ key: "section:recent", title: "Recent", rows: recent }] : []),
      ...groups
        .map((group) => ({
          key: group.provider.id,
          title: group.provider.name,
          rows: group.rows.filter((row) => !listed.has(row.key)),
        }))
        .filter((section) => section.rows.length > 0),
    ];
  }, [groups, listed, preferences.favoriteModels, preferences.recentModels, providers, query, allRows]);

  const selectable = useMemo(
    () => sections.flatMap((section) => section.rows).filter((row) => row.provider.ready),
    [sections],
  );

  // Keep the highlight valid while the filter narrows the list.
  const currentKey = selectable.some((row) => row.key === activeKey) ? activeKey : selectable[0]?.key;

  useEffect(() => {
    if (!open || !currentKey) return;
    rowRefs.current.get(currentKey)?.scrollIntoView({ block: "nearest" });
  }, [currentKey, open]);

  const move = (delta: number) => {
    if (selectable.length === 0) return;
    const index = selectable.findIndex((row) => row.key === currentKey);
    const next = index < 0 ? 0 : (index + delta + selectable.length) % selectable.length;
    setActiveKey(selectable[next].key);
  };

  const remember = (selection: ModelSelection) => {
    const recent = [
      selection,
      ...preferences.recentModels.filter(
        (item) => !sameSelection(item, selection.provider, selection.model),
      ),
    ].slice(0, 8);
    void savePreferences({ ...preferences, recentModels: recent });
  };

  const choose = (row: Row) => {
    onSelect(row.provider.id, row.id);
    remember({ provider: row.provider.id, model: row.id });
    setOpen(false);
  };

  const toggleFavorite = (row: Row) => {
    const favorite = preferences.favoriteModels.some((item) =>
      sameSelection(item, row.provider.id, row.id),
    );
    const favoriteModels = favorite
      ? preferences.favoriteModels.filter((item) => !sameSelection(item, row.provider.id, row.id))
      : [...preferences.favoriteModels, { provider: row.provider.id, model: row.id }];
    void savePreferences({ ...preferences, favoriteModels });
  };

  const submit = () => {
    const row = selectable.find((item) => item.key === currentKey);
    if (row) choose(row);
  };

  const changeOpen = (next: boolean) => {
    if (next) {
      const selected = providers
        .flatMap((item) => allRows.get(item.id) ?? [])
        .find((row) => row.provider.id === provider && row.id === model);
      setActiveKey(selected?.key ?? selectable[0]?.key);
    } else {
      setQuery("");
    }
    setOpen(next);
  };

  // Close the picker before opening another dialog.
  const runAction = (action: () => void) => {
    changeOpen(false);
    action();
  };

  const renderRow = (row: Row) => {
    const key = row.key;
    const selected = row.provider.id === provider && row.id === model;
    const active = key === currentKey;
    const favorite = preferences.favoriteModels.some((item) =>
      sameSelection(item, row.provider.id, row.id),
    );
    return (
      <div key={key} className="flex items-center gap-0.5">
        <button
          ref={(node) => {
            if (node) rowRefs.current.set(key, node);
            else rowRefs.current.delete(key);
          }}
          type="button"
          role="option"
          aria-selected={selected}
          disabled={!row.provider.ready}
          data-active={active ? "true" : undefined}
          data-state={active ? "hover" : undefined}
          onMouseMove={() => setActiveKey(key)}
          onClick={() => choose(row)}
          className="interactive flex h-control-sm min-w-0 flex-1 items-center gap-1.5 rounded-md ps-1.5 pe-1 text-left text-body text-text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="grid size-4 shrink-0 place-items-center">
            {selected && <Check className="size-3.5 text-text-base" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{row.model.name || row.model.id}</span>
          {row.variant && (
            <span className="shrink-0 rounded-sm bg-bg-layer-03 px-1 py-0.5 text-caption text-text-faint">
              {row.variant}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label={favorite ? `Unfavorite ${modelLabel(row.model, row.variant)}` : `Favorite ${modelLabel(row.model, row.variant)}`}
          onClick={() => toggleFavorite(row)}
          className="interactive grid size-6 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
        >
          <Star className={`size-3.5 ${favorite ? "fill-current text-text-base" : ""}`} />
        </button>
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label="Select model"
        aria-haspopup="dialog"
        title={selectedProvider ? `${selectedProvider.name} / ${label}` : label}
        onClick={() => changeOpen(true)}
        className="interactive flex h-control-xs max-w-44 min-w-0 items-center gap-1 rounded-md px-2 text-meta text-text-muted hover:text-text-base"
      >
        {selectedProvider && (
          <>
            <span className="min-w-0 shrink-[2] truncate text-text-faint">{selectedProvider.name}</span>
            <span className="shrink-0 text-text-faint">/</span>
          </>
        )}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          size="model"
          height="body"
          className="flex flex-col gap-0 overflow-hidden border-0 bg-bg-base p-0 shadow-elevation-raised"
        >
          <DialogTitle className="sr-only">Select model</DialogTitle>
          <DialogDescription className="sr-only">
            Search the configured providers and pick the model for this session.
          </DialogDescription>
          <div className="flex shrink-0 flex-col gap-1.5 border-b-[0.5px] border-border-weak p-1.5">
            <div className="flex items-center gap-1">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-1.5 size-3.5 -translate-y-1/2 text-text-muted" />
                <Input
                  autoFocus
                  size="sm"
                  value={query}
                  aria-label="Search models"
                  placeholder="Search models"
                  className="min-w-0 w-full border-0 bg-transparent pl-6 focus:outline-none focus-visible:outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      move(1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      move(-1);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Connect provider"
                    onClick={() => runAction(onAddProvider)}
                    className="shrink-0 text-text-faint hover:text-text-base"
                  >
                    <Plus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Connect provider</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Manage models"
                    onClick={() => runAction(onManageModels)}
                    className="shrink-0 text-text-faint hover:text-text-base"
                  >
                    <SlidersHorizontal className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Manage models</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div role="listbox" aria-label="Models" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pt-3 pb-1.5">
            {sections.length === 0 && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">
                {query.trim() ? "No matching models" : "No models available"}
              </div>
            )}
            {sections.map((section) => (
              <div key={section.key} className="contents">
                <div className="sticky top-0 z-[1] flex h-control-md items-center gap-1.5 bg-bg-base ps-8 pe-2 text-meta text-text-faint">
                  <span className="truncate">{section.title}</span>
                  {!section.key.startsWith("section:") && !section.rows[0]?.provider.ready && (
                    <span className="shrink-0 text-state-fg-warning">No API key</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">{section.rows.map(renderRow)}</div>
                <div className="h-1" aria-hidden="true" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
