import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import fuzzysort from "fuzzysort";
import { update } from "@lingzhu/ui/solid";
import { ArrowLeft, Search, X } from "@lingzhu/ui/icons";
import { t } from "@lingzhu/ui/i18n";
import type { SettingsSectionID } from "../../lib/settings";

export interface SettingsNavItem {
  id: SettingsSectionID;
  label: string;
  icon: Component<{ class?: string }>;
}

export interface SettingsNavGroup {
  label?: string;
  items: SettingsNavItem[];
}

/** One searchable setting, gathered from the rendered section rows. */
export interface SettingsSearchEntry {
  key: string;
  section: SettingsSectionID;
  sectionLabel: string;
  title: string;
  keywords: string;
}

interface Props {
  groups: SettingsNavGroup[];
  section: SettingsSectionID;
  index: SettingsSearchEntry[];
  onSectionChange: (section: SettingsSectionID) => void;
  onReveal: (entry: SettingsSearchEntry) => void;
  onBack?: () => void;
}

const RESULT_LIMIT = 40;

function rank(index: SettingsSearchEntry[], query: string): SettingsSearchEntry[] {
  const value = query.trim().toLowerCase();
  if (!value) return [];
  const terms = value.split(/\s+/);
  const scores = new Map<SettingsSearchEntry, number>();
  const order = new Map(index.map((entry, position) => [entry, position]));

  for (const term of terms) {
    const results = fuzzysort.go(term, index, {
      keys: ["title", "sectionLabel", "keywords"],
      threshold: -10000,
      scoreFn: (result) => result.score + (result[0]?.score ?? 0) * 2,
    });
    const matched = new Set<SettingsSearchEntry>();
    for (const result of results) {
      matched.add(result.obj);
      scores.set(result.obj, (scores.get(result.obj) ?? 0) + result.score);
    }
    for (const entry of index) if (!matched.has(entry)) scores.delete(entry);
  }

  return [...scores.keys()]
    .sort(
      (left, right) =>
        (scores.get(right) ?? 0) - (scores.get(left) ?? 0) || (order.get(left) ?? 0) - (order.get(right) ?? 0),
    )
    .slice(0, RESULT_LIMIT);
}

/**
 * Settings rail: a back button, a filter over every setting on the page, and
 * the grouped section list. While a query is present the rail lists matching
 * settings instead, and choosing one opens its section at that row.
 */
export function SettingsNav(props: Props) {
  const [query, setQuery] = createSignal("");
  const [highlight, setHighlight] = createSignal(0);
  let input: HTMLInputElement | undefined;

  const matches = createMemo(() => rank(props.index, query()));
  const searching = createMemo(() => query().trim().length > 0);

  createEffect(() => {
    query();
    setHighlight(0);
  });

  // Mod+F focuses the settings search from anywhere in settings, as in the
  // reference shell; Escape inside the field clears it.
  onMount(() => {
    const onFind = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      input?.focus();
      input?.select();
    };
    window.addEventListener("keydown", onFind);
    onCleanup(() => window.removeEventListener("keydown", onFind));
  });

  const choose = (entry: SettingsSearchEntry) => {
    setQuery("");
    props.onSectionChange(entry.section);
    props.onReveal(entry);
  };

  const clear = () => {
    setQuery("");
    input?.focus();
  };

  return (
    <aside
      aria-label={t("settingsSections")}
      class="hidden w-[328px] shrink-0 flex-col pt-[50px] pr-16 pb-12 pl-6 md:flex"
    >
      <div class="flex min-h-0 w-[240px] max-w-full flex-col gap-4">
        <Show when={props.onBack}>
          <button
            type="button"
            onClick={() => props.onBack?.()}
            class="mb-7 flex h-7 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-left text-body text-text-muted hover:bg-bg-layer-03 hover:text-text-base"
          >
            <ArrowLeft class="size-4 shrink-0" />
            <span class="truncate">{t("backToApp")}</span>
          </button>
        </Show>

        <div class="relative flex h-9 shrink-0 items-center">
          <Search class="pointer-events-none absolute left-4 size-4 text-text-faint" />
          <input
            ref={(element) => {
              input = element;
            }}
            type="search"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onFocus={() => setHighlight(0)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searching()) {
                event.preventDefault();
                clear();
                return;
              }
              if (!searching()) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const list = matches();
                if (list.length === 0) return;
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                update(setHighlight, highlight, (current) => (current + step + list.length) % list.length);
                return;
              }
              if (event.key === "Enter") {
                const entry = matches()[highlight()];
                if (!entry) return;
                event.preventDefault();
                choose(entry);
              }
            }}
            placeholder={t("searchSettings")}
            aria-label={t("searchSettings")}
            spellcheck={false}
            autocomplete="off"
            class="settings-search-input h-full w-full rounded-md bg-bg-layer-02/60 pr-7 pl-10 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base transition-colors placeholder:text-text-faint hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02 [&:not(:placeholder-shown)]:bg-bg-layer-02 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          />
          <Show when={searching()}>
            <button
              type="button"
              aria-label={t("clearSearch")}
              onClick={clear}
              class="interactive absolute right-1 grid size-5 place-items-center rounded-xs text-text-faint hover:text-icon-base"
            >
              <X class="size-3.5" />
            </button>
          </Show>
        </div>

        <Show
          when={searching()}
          fallback={
            <div class="settings-nav-groups flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto no-scrollbar">
              <For each={props.groups}>
                {(group) => (
                  <div class="flex w-full flex-col gap-1">
                    <Show when={group.label}>
                      <div class="flex h-7 items-center justify-between gap-2 rounded-xs px-1.5 text-body font-[440] text-text-muted hover:bg-bg-layer-03">
                        {group.label}
                      </div>
                    </Show>
                    <For each={group.items}>
                      {(item) => {
                        const Icon = item.icon;
                        const selected = () => item.id === props.section;
                        return (
                          <button
                            type="button"
                            data-selected={selected() ? "true" : undefined}
                            aria-current={selected() ? "page" : undefined}
                            onClick={() => props.onSectionChange(item.id)}
                            class={`interactive flex h-7 w-full shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-left text-body ${
                              selected() ? "bg-bg-layer-03 text-text-base" : "text-text-muted hover:text-text-base"
                            }`}
                          >
                            <Icon class={`size-4 shrink-0 ${selected() ? "" : "text-text-faint"}`} />
                            <span class="truncate">{item.label}</span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>
            </div>
          }
        >
          <div
            class="settings-nav-groups flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar"
            role="listbox"
            aria-label={t("settingsResults")}
          >
            <Show
              when={matches().length > 0}
              fallback={
                <p class="grid min-h-[120px] place-items-center text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted">
                  {t("noSettingsMatch", { query: query().trim() })}
                </p>
              }
            >
              <For each={matches()}>
                {(entry, position) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={position() === highlight()}
                    data-selected={position() === highlight() ? "true" : undefined}
                    data-setting-entry={entry.key}
                    onMouseEnter={() => setHighlight(position())}
                    onClick={() => choose(entry)}
                    class="interactive flex h-9 w-full shrink-0 items-center gap-3 rounded-md px-2 text-left text-body leading-4 tracking-[-0.04px]"
                  >
                    <span class="min-w-0 truncate font-[530] text-text-base">{entry.title}</span>
                    <span class="ml-auto min-w-0 shrink-0 truncate font-[440] text-text-muted">
                      {entry.sectionLabel}
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    </aside>
  );
}
