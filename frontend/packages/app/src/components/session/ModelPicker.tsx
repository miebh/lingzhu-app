import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Check, ChevronDown, ChevronRight, Plus, Search, SlidersHorizontal, Star } from "@lingzhu/ui/icons";
import { buttonVariants } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { Keybind } from "@lingzhu/ui/keybind";
import { cn } from "@lingzhu/ui/utils";
import { update } from "@lingzhu/ui/solid";
import { formatKeybind } from "../../lib/slash";
import { modelLabel, modelVariantID, orderedVariants, splitModelID } from "../../lib/models";
import type { ModelSelection, ModelSettings, ProviderSettings } from "@lingzhu/ui/types";
import { usePreferences, usePreferencesStore } from "../../app/useApp";
import { useT } from "@lingzhu/ui/i18n";

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
}

interface Section {
  key: string;
  title: string;
  rows: Row[];
}

const optionKey = (providerID: string, modelID: string) => `${providerID}\u0000${modelID}`;

/** The flyout sits beside the row, as in the reference dialog. */
const FLYOUT_WIDTH = 160;
const FLYOUT_GAP = 6;

function placeFlyout(row: DOMRect) {
  const right = row.right + FLYOUT_GAP;
  const left = row.left - FLYOUT_GAP - FLYOUT_WIDTH;
  const viewport = window.innerWidth;
  const x =
    right + FLYOUT_WIDTH <= viewport - FLYOUT_GAP
      ? right
      : left >= FLYOUT_GAP
        ? left
        : Math.max(FLYOUT_GAP, Math.min(right, viewport - FLYOUT_WIDTH - FLYOUT_GAP));
  const maxTop = Math.max(FLYOUT_GAP, window.innerHeight - 240);
  return { left: x, top: Math.max(FLYOUT_GAP, Math.min(row.top - 2, maxTop)) };
}

const baseModelID = (id: string) => splitModelID(id).model;

const sameSelection = (a: ModelSelection, providerID: string, modelID: string) =>
  a.provider === providerID && a.model === modelID;

const sameFavorite = (item: ModelSelection, providerID: string, modelID: string) =>
  item.provider === providerID && baseModelID(item.model) === modelID;

const variantsOf = (row: Row) => orderedVariants(row.model.variants);

const uniqueRows = (rows: Row[]) => {
  const seen = new Map<string, Row>();
  for (const row of rows) seen.set(row.key, row);
  return [...seen.values()];
};

/** One row per model; its reasoning levels live in the flyout beside the active row. */
function rowsFor(provider: ProviderSettings, hidden: Set<string>): Row[] {
  const blocked = new Set(provider.blacklist ?? []);
  const allowed = new Set(provider.whitelist ?? []);
  return provider.models.flatMap((model) => {
    if (blocked.has(model.id) || hidden.has(optionKey(provider.id, model.id))) return [];
    if (allowed.size > 0 && !allowed.has(model.id)) return [];
    return [{ key: optionKey(provider.id, model.id), provider, model }];
  });
}

function matches(row: Row, term: string) {
  if (!term) return true;
  const name = row.model.name || row.model.id;
  return (
    row.provider.name.toLowerCase().includes(term) ||
    row.provider.id.toLowerCase().includes(term) ||
    name.toLowerCase().includes(term) ||
    row.model.id.toLowerCase().includes(term)
  );
}

/**
 * The model chip opens a searchable command-style dialog. Favorites and recents
 * lead the list; reasoning levels open in a flyout beside the active row, so the
 * list never repeats one model under several names.
 */
export function ModelPicker(props: Props) {
  const tr = useT();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [activeKey, setActiveKey] = createSignal<string>();
  const [staged, setStaged] = createSignal<Record<string, string | null>>({});
  const [flyoutKey, setFlyoutKey] = createSignal<string>();
  const [flyout, setFlyout] = createSignal<{ left: number; top: number }>();
  const rowRefs = new Map<string, HTMLButtonElement>();
  let flyoutEl: HTMLDivElement | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const preferences = usePreferences();
  const savePreferences = usePreferencesStore((state) => state.save);

  const current = createMemo(() => splitModelID(props.model));
  const selectedProvider = createMemo(() => props.providers.find((item) => item.id === props.provider));
  const selectedModel = createMemo(() =>
    selectedProvider()?.models.find((item) => item.id === current().model),
  );
  const label = createMemo(() => {
    const model = selectedModel();
    return model ? modelLabel(model) : props.model || "Default model";
  });

  const allRows = createMemo(() => {
    const hidden = new Set(
      preferences().hiddenModels.map((item) => optionKey(item.provider, item.model)),
    );
    return new Map(props.providers.map((item) => [item.id, rowsFor(item, hidden)]));
  });
  const rowsByKey = createMemo(
    () => new Map([...allRows().values()].flat().map((row) => [row.key, row])),
  );

  const groups = createMemo(() => {
    const term = query().trim().toLowerCase();
    return props.providers
      .map((item) => ({ provider: item, rows: (allRows().get(item.id) ?? []).filter((row) => matches(row, term)) }))
      .filter((group) => group.rows.length > 0);
  });

  const pick = (selection: ModelSelection): Row | undefined => {
    const item = props.providers.find((entry) => entry.id === selection.provider);
    if (!item) return undefined;
    const id = baseModelID(selection.model);
    return (allRows().get(item.id) ?? []).find((row) => row.model.id === id);
  };

  const listed = createMemo(() => {
    const term = query().trim();
    if (term) return new Set<string>();
    return new Set(
      [...preferences().favoriteModels, ...preferences().recentModels]
        .map((selection) => pick(selection)?.key)
        .filter((key): key is string => !!key),
    );
  });

  const sections = createMemo((): Section[] => {
    if (query().trim()) {
      return groups().map((group) => ({ key: group.provider.id, title: group.provider.name, rows: group.rows }));
    }
    const favorites = uniqueRows(preferences().favoriteModels.map(pick).filter((row): row is Row => !!row));
    const favoriteKeys = new Set(favorites.map((row) => row.key));
    const recentRows = uniqueRows(
      preferences()
        .recentModels.map(pick)
        .filter((row): row is Row => !!row && !favoriteKeys.has(row.key)),
    );
    return [
      ...(favorites.length > 0 ? [{ key: "section:favorites", title: tr("favorites"), rows: favorites }] : []),
      ...(recentRows.length > 0 ? [{ key: "section:recent", title: tr("recent"), rows: recentRows }] : []),
      ...groups()
        .map((group) => ({
          key: group.provider.id,
          title: group.provider.name,
          rows: group.rows.filter((row) => !listed().has(row.key)),
        }))
        .filter((section) => section.rows.length > 0),
    ];
  });

  const selectable = createMemo(() =>
    sections()
      .flatMap((section) => section.rows)
      .filter((row) => row.provider.ready),
  );

  // Keep the highlight valid while the filter narrows the list.
  const currentKey = createMemo(() =>
    selectable().some((row) => row.key === activeKey()) ? activeKey() : selectable()[0]?.key,
  );
  const flyoutRow = createMemo(() => {
    const key = flyoutKey();
    return key ? rowsByKey().get(key) : undefined;
  });

  createEffect(() => {
    const key = currentKey();
    if (!open() || !key) return;
    rowRefs.get(key)?.scrollIntoView({ block: "nearest" });
  });

  onCleanup(() => {
    if (closeTimer) clearTimeout(closeTimer);
  });

  const cancelClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = undefined;
  };

  const closeSoon = () => {
    cancelClose();
    closeTimer = setTimeout(() => setFlyoutKey(undefined), 140);
  };

  const variantFor = (row: Row) => {
    const value = staged()[row.key];
    if (value !== undefined) return value ?? undefined;
    if (row.provider.id === props.provider && row.model.id === current().model) return current().variant;
    return undefined;
  };

  const openFlyout = (row: Row) => {
    cancelClose();
    if (variantsOf(row).length === 0) {
      setFlyoutKey(undefined);
      return;
    }
    const rowElement = rowRefs.get(row.key);
    if (!rowElement) return;
    setFlyout(placeFlyout(rowElement.getBoundingClientRect()));
    setFlyoutKey(row.key);
  };

  const move = (delta: number) => {
    const rows = selectable();
    if (rows.length === 0) return;
    const index = rows.findIndex((row) => row.key === currentKey());
    const next = index < 0 ? 0 : (index + delta + rows.length) % rows.length;
    const row = rows[next];
    setActiveKey(row.key);
    openFlyout(row);
  };

  const cycleVariant = (delta: number) => {
    const row = selectable().find((item) => item.key === currentKey());
    if (!row) return;
    const options: Array<string | null> = [null, ...variantsOf(row)];
    if (options.length <= 1) return;
    const index = options.indexOf(variantFor(row) ?? null);
    const next = options[(index + delta + options.length) % options.length];
    update(setStaged, staged, (items) => ({ ...items, [row.key]: next }));
    openFlyout(row);
  };

  const remember = (selection: ModelSelection) => {
    const recent = [
      selection,
      ...preferences().recentModels.filter(
        (item) => !sameSelection(item, selection.provider, selection.model),
      ),
    ].slice(0, 8);
    void savePreferences()({ ...preferences(), recentModels: recent });
  };

  const choose = (row: Row, value?: string | null) => {
    const variant = value === undefined ? variantFor(row) : value ?? undefined;
    const id = variant ? modelVariantID(row.model.id, variant) : row.model.id;
    props.onSelect(row.provider.id, id);
    remember({ provider: row.provider.id, model: id });
    setOpen(false);
  };

  const favoriteFor = (row: Row) =>
    preferences().favoriteModels.some((item) => sameFavorite(item, row.provider.id, row.model.id));

  const toggleFavorite = (row: Row) => {
    const favorite = favoriteFor(row);
    const favoriteModels = favorite
      ? preferences().favoriteModels.filter((item) => !sameFavorite(item, row.provider.id, row.model.id))
      : [...preferences().favoriteModels, { provider: row.provider.id, model: row.model.id }];
    void savePreferences()({ ...preferences(), favoriteModels });
  };

  const submit = () => {
    const row = selectable().find((item) => item.key === currentKey());
    if (row) choose(row);
  };

  const changeOpen = (next: boolean) => {
    cancelClose();
    setFlyoutKey(undefined);
    setStaged({});
    if (next) {
      const selected = props.providers
        .flatMap((item) => allRows().get(item.id) ?? [])
        .find((row) => row.provider.id === props.provider && row.model.id === current().model);
      setActiveKey(selected?.key ?? selectable()[0]?.key);
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

  const renderRow = (row: Row, mixed?: boolean) => {
    const key = row.key;
    const selected = () => row.provider.id === props.provider && row.model.id === current().model;
    const active = () => key === currentKey();
    const favorite = () => favoriteFor(row);
    const variants = () => variantsOf(row);
    return (
      <div
        data-active={active() ? "true" : undefined}
        data-state={active() ? "hover" : undefined}
        class="interactive group/row flex h-7 items-center gap-0.5 rounded-md"
      >
        <button
          ref={(node) => {
            if (node) rowRefs.set(key, node);
            else rowRefs.delete(key);
          }}
          type="button"
          role="option"
          aria-selected={selected()}
          disabled={!row.provider.ready}
          onMouseEnter={() => {
            setActiveKey(key);
            openFlyout(row);
          }}
          onMouseLeave={(event) => {
            const target = event.relatedTarget;
            if (target instanceof Node && flyoutEl?.contains(target)) return;
            closeSoon();
          }}
          onClick={() => choose(row)}
          class="flex h-full min-w-0 flex-1 items-center gap-1.5 ps-1.5 pe-[3px] text-left text-body font-[440] text-text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span class="grid size-4 shrink-0 place-items-center">
            <Show when={selected()}>
              <Check class="size-4 text-icon-base" />
            </Show>
          </span>
          <span class="min-w-0 flex-1 truncate">{row.model.name || row.model.id}</span>
          <Show when={mixed}>
            <span class="max-w-24 shrink-0 truncate text-body text-text-faint">{row.provider.name}</span>
          </Show>
          <Show when={active() && variants().length > 0}>
            <span class="flex shrink-0 items-center gap-1 text-body capitalize text-text-muted">
              <span class="max-w-[84px] truncate">{variantFor(row) ?? tr("defaultOption")}</span>
              <ChevronRight class="size-4" />
            </span>
          </Show>
        </button>
        <button
          type="button"
          aria-label={
            favorite()
              ? `Unfavorite ${row.model.name || row.model.id}`
              : `Favorite ${row.model.name || row.model.id}`
          }
          onClick={() => toggleFavorite(row)}
          class="interactive grid size-6 shrink-0 place-items-center rounded-md text-text-faint opacity-0 hover:text-text-base group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <Star class={`size-3.5 ${favorite() ? "fill-current text-text-base" : ""}`} />
        </button>
      </div>
    );
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={tr("modelPickerSelectModel")}
          aria-haspopup="dialog"
          onClick={() => changeOpen(true)}
          class="interactive flex h-7 max-w-[60cqw] min-w-0 items-center justify-start gap-1.5 rounded-md px-[11px] text-body font-[440] text-text-muted hover:text-text-base"
        >
          <Show when={selectedProvider()}>
            {(provider) => (
              <>
                <span class="min-w-0 shrink-[2] truncate text-text-faint">{provider().name}</span>
                <span aria-hidden="true" class="shrink-0 text-icon-faint">
                  /
                </span>
                <span class="sr-only">{" / "}</span>
              </>
            )}
          </Show>
          <span class="flex min-w-0 whitespace-nowrap leading-4">
            <span class="min-w-0 truncate">{label()}</span>
          </span>
          <ChevronDown class="-ms-0.5 -me-1 size-4 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top">
          <span class="flex items-center gap-1.5">
            {tr("modelPickerSelectModel")}
            <Keybind keys={(formatKeybind("mod+'") ?? "").split("+")} />
          </span>
        </TooltipContent>
      </Tooltip>

      <Dialog open={open()} onOpenChange={changeOpen}>
        <DialogContent
          size="model"
          height="model"
          hideClose
          class="flex flex-col gap-0 overflow-hidden rounded-xl border-0 bg-bg-base p-0"
        >
          <DialogTitle class="sr-only">{tr("modelPickerSelectModel")}</DialogTitle>
          <DialogDescription class="sr-only">
            Search the configured providers and pick the model for this session.
          </DialogDescription>
          <div class="flex shrink-0 flex-col gap-1.5 border-b-[0.5px] border-border-muted p-1.5">
            <div class="flex items-center gap-1">
              <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute top-1/2 left-1.5 size-4 -translate-y-1/2 text-text-muted" />
                <Input
                  autofocus
                  size="sm"
                  value={query()}
                  aria-label={tr("manageModelsSearchModels")}
                  placeholder={tr("manageModelsSearchModels")}
                  class="h-7 min-w-0 w-full border-0 bg-transparent pl-7 shadow-none hover:shadow-none focus:outline-none focus-visible:shadow-none focus-visible:outline-none"
                  onInput={(event) => {
                    setQuery(event.currentTarget.value);
                    setFlyoutKey(undefined);
                    setStaged({});
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      move(1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      move(-1);
                    } else if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !query().trim()) {
                      event.preventDefault();
                      cycleVariant(event.key === "ArrowRight" ? 1 : -1);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
              </div>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label={tr("modelPickerConnectProvider")}
                  onClick={() => runAction(props.onAddProvider)}
                  class={cn(
                    buttonVariants({ variant: "ghost", size: "icon-xs" }),
                    "shrink-0 text-text-faint hover:text-text-base",
                  )}
                >
                  <Plus class="size-4" />
                </TooltipTrigger>
                <TooltipContent side="top">{tr("connectProvider")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label={tr("modelPickerManageModels")}
                  onClick={() => runAction(props.onManageModels)}
                  class={cn(
                    buttonVariants({ variant: "ghost", size: "icon-xs" }),
                    "shrink-0 text-text-faint hover:text-text-base",
                  )}
                >
                  <SlidersHorizontal class="size-4" />
                </TooltipTrigger>
                <TooltipContent side="top">{tr("manageModels")}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div class="relative flex min-h-0 flex-1 flex-col">
            <div
              role="listbox"
              aria-label={tr("manageModelsModels")}
              onScroll={() => setFlyoutKey(undefined)}
              class="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pt-0 pb-1.5 [scroll-padding-top:36px]"
            >
              <Show when={sections().length === 0}>
                <div class="grid min-h-[120px] place-items-center text-body font-[440] text-text-muted">
                  {query().trim() ? tr("noMatchingModels") : tr("noModelsAvailable")}
                </div>
              </Show>
              <For each={sections()}>
                {(section) => (
                  <div class="contents">
                    <div class="sticky top-0 z-[1] flex items-center gap-1.5 bg-bg-base pt-4 pb-0.5 ps-[34px] pe-1.5 text-meta leading-[18px] text-text-faint">
                      <span class="truncate">{section.title}</span>
                      <Show when={!section.key.startsWith("section:") && !section.rows[0]?.provider.ready}>
                        <span class="shrink-0 text-state-fg-warning">{tr("noAPIKey")}</span>
                      </Show>
                    </div>
                    <div class="flex flex-col gap-1">
                      <For each={section.rows}>
                        {(row) => renderRow(row, section.key.startsWith("section:"))}
                      </For>
                    </div>
                    <div class="h-1" aria-hidden="true" />
                  </div>
                )}
              </For>
            </div>

            <Show when={flyoutRow() && flyout()}>
              <div
                ref={(el) => (flyoutEl = el)}
                role="menu"
                aria-label={tr("modelPickerReasoningLevel")}
                style={{
                  left: `${flyout()!.left}px`,
                  top: `${flyout()!.top}px`,
                  width: `${FLYOUT_WIDTH}px`,
                }}
                onMouseEnter={cancelClose}
                onMouseLeave={closeSoon}
                class="fixed z-20 flex max-h-[400px] flex-col gap-px overflow-y-auto rounded-lg border-[0.5px] border-border-muted bg-bg-layer-01 p-1 shadow-elevation-overlay"
              >
                <For each={[null, ...variantsOf(flyoutRow()!)]}>
                  {(value) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={variantFor(flyoutRow()!) === (value ?? undefined)}
                      onClick={() => choose(flyoutRow()!, value)}
                      class="interactive flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body text-text-base"
                    >
                      <span class="min-w-0 flex-1 truncate capitalize">{value ?? tr("defaultOption")}</span>
                      <Show when={variantFor(flyoutRow()!) === (value ?? undefined)}>
                        <Check class="size-3.5 shrink-0 text-icon-base" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
