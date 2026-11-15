import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ArrowLeft, Search, X } from "@lingzhu/ui/icons";
import { t } from "@lingzhu/ui/i18n";
import type { SettingsSectionID } from "../../lib/settings";

export interface SettingsNavItem {
  id: SettingsSectionID;
  label: string;
  icon: ComponentType<{ className?: string }>;
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
  return index
    .map((entry) => {
      const title = entry.title.toLowerCase();
      const haystack = `${title} ${entry.sectionLabel.toLowerCase()} ${entry.keywords.toLowerCase()}`;
      if (!terms.every((term) => haystack.includes(term))) return undefined;
      const score = title.startsWith(value) ? 0 : title.includes(value) ? 1 : 2;
      return { entry, score };
    })
    .filter((item): item is { entry: SettingsSearchEntry; score: number } => item !== undefined)
    .sort((left, right) => left.score - right.score)
    .slice(0, RESULT_LIMIT)
    .map((item) => item.entry);
}

/**
 * Settings rail: a back button, a filter over every setting on the page, and
 * the grouped section list. While a query is present the rail lists matching
 * settings instead, and choosing one opens its section at that row.
 */
export function SettingsNav({ groups, section, index, onSectionChange, onReveal, onBack }: Props) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => rank(index, query), [index, query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Mod+F focuses the settings search from anywhere in settings, as in the
  // reference shell; Escape inside the field clears it.
  useEffect(() => {
    const onFind = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onFind);
    return () => window.removeEventListener("keydown", onFind);
  }, []);

  const choose = (entry: SettingsSearchEntry) => {
    setQuery("");
    onSectionChange(entry.section);
    onReveal(entry);
  };

  const clear = () => {
    setQuery("");
    input.current?.focus();
  };

  return (
    <aside
      aria-label={t("settingsSections")}
      className="hidden w-[328px] shrink-0 flex-col pt-[50px] pr-16 pb-12 pl-6 md:flex"
    >
      <div className="flex min-h-0 w-[240px] max-w-full flex-col gap-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-7 flex h-7 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-left text-body text-text-muted hover:bg-bg-layer-03 hover:text-text-base"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">{t("backToApp")}</span>
          </button>
        )}

        <div className="relative flex h-9 shrink-0 items-center">
          <Search className="pointer-events-none absolute left-4 size-4 text-text-faint" />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setHighlight(0)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searching) {
                event.preventDefault();
                clear();
                return;
              }
              if (!searching) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                if (matches.length === 0) return;
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setHighlight((current) => (current + step + matches.length) % matches.length);
                return;
              }
              if (event.key === "Enter") {
                const entry = matches[highlight];
                if (!entry) return;
                event.preventDefault();
                choose(entry);
              }
            }}
            placeholder={t("searchSettings")}
            aria-label={t("searchSettings")}
            spellCheck={false}
            autoComplete="off"
            className="settings-search-input h-full w-full rounded-md bg-bg-layer-02/60 pr-7 pl-10 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base transition-colors placeholder:text-text-faint hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02 [&:not(:placeholder-shown)]:bg-bg-layer-02 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          />
          {searching && (
            <button
              type="button"
              aria-label={t("clearSearch")}
              onClick={clear}
              className="interactive absolute right-1 grid size-5 place-items-center rounded-xs text-text-faint hover:text-icon-base"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {searching ? (
          <div className="settings-nav-groups flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar" role="listbox" aria-label={t("settingsResults")}>
            {matches.length === 0 ? (
              <p className="grid min-h-[120px] place-items-center text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted">
                {t("noSettingsMatch", { query: query.trim() })}              </p>
            ) : (
              matches.map((entry, position) => (
                <button
                  key={entry.key}
                  type="button"
                  role="option"
                  aria-selected={position === highlight}
                  data-selected={position === highlight ? "true" : undefined}
                  data-setting-entry={entry.key}
                  onMouseEnter={() => setHighlight(position)}
                  onClick={() => choose(entry)}
                  className="interactive flex h-9 w-full shrink-0 items-center gap-3 rounded-md px-2 text-left text-body leading-4 tracking-[-0.04px]"
                >
                  <span className="min-w-0 truncate font-[530] text-text-base">{entry.title}</span>
                  <span className="ml-auto min-w-0 shrink-0 truncate font-[440] text-text-muted">
                    {entry.sectionLabel}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="settings-nav-groups flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto no-scrollbar">
            {groups.map((group, index) => (
              <div key={group.label ?? index} className="flex w-full flex-col gap-1">
                {group.label && (
                  <div className="flex h-7 items-center justify-between gap-2 rounded-xs px-1.5 text-body font-[440] text-text-muted hover:bg-bg-layer-03">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const selected = item.id === section;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-selected={selected ? "true" : undefined}
                      aria-current={selected ? "page" : undefined}
                      onClick={() => onSectionChange(item.id)}
                      className={`interactive flex h-7 w-full shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-left text-body ${
                        selected ? "bg-bg-layer-03 text-text-base" : "text-text-muted hover:text-text-base"
                      }`}
                    >
                      <Icon className={`size-4 shrink-0 ${selected ? "" : "text-text-faint"}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
