import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "@lingzhu/ui/icons";
import { t } from "@lingzhu/ui/i18n";
import type { HomeSessionRow as HomeSessionRowData } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../ProjectAvatar";

interface Props {
  rows: HomeSessionRowData[];
  query: string;
  onQueryChange: (value: string) => void;
  hideProjectName: boolean;
  onOpenSession: (path: string, sessionID: string) => void;
}

interface RowProps {
  row: HomeSessionRowData;
  index: number;
  active: boolean;
  hideProjectName: boolean;
  onHover: () => void;
  onSelect: () => void;
}

/** One suggestion in the home session search panel. */
function HomeSessionSearchRow({ row, index, active, hideProjectName, onHover, onSelect }: RowProps) {
  return (
    <button
      id={`home-session-search-option-${index}`}
      type="button"
      role="option"
      aria-selected={active}
      data-active={active ? "" : undefined}
      data-component="home-session-search-row"
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex h-10 w-full shrink-0 items-center gap-1.5 py-3 pl-[18px] pr-6 text-left ${
        active ? "bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]" : ""
      }`}
    >
      <ProjectAvatar name={row.workspaceName} icon={row.icon} color={row.color} />
      <span
        data-component="home-session-title"
        className="min-w-0 truncate text-body leading-4 font-[530] tracking-[-0.04px] text-text-base"
      >
        {row.title}
      </span>
      {!hideProjectName && (
        <span
          data-component="home-session-project-name"
          className="min-w-0 shrink-0 truncate text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted"
        >
          {row.workspaceName}
        </span>
      )}
    </button>
  );
}

/** The home session search box and its suggestion panel. */
export function HomeSessionSearch({ rows, query, onQueryChange, hideProjectName, onOpenSession }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const searchRoot = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? rows.filter((row) => `${row.title} ${row.workspaceName}`.toLowerCase().includes(term))
      : rows;
    return list.slice(0, 10);
  }, [rows, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const panelOpen = open && query.trim() !== "";

  const closeSearch = () => {
    setOpen(false);
    setActive(0);
  };

  return (
    <div
      ref={searchRoot}
      data-component="home-session-search"
      className="relative z-30 w-full"
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && searchRoot.current?.contains(event.relatedTarget)) return;
        closeSearch();
      }}
    >
      {panelOpen && (
        <div
          data-component="home-session-search-panel"
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-10 flex flex-col overflow-hidden rounded-xl bg-bg-base elevation-floating"
          style={{ top: -6, insetInlineStart: -6, width: "calc(100% + 12px)" }}
        >
          <div className="flex flex-col pt-9">
            <div
              id="home-session-search-results"
              role="listbox"
              aria-label={t("sessionSearchResults")}
              className="flex flex-col gap-4 pt-4"
            >
              {results.length === 0 ? (
                <p className="my-1.5 px-4 pb-2 text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted">
                  {t("noSessionsFound", { query: query.trim() })}
                </p>
              ) : (
                <div className="flex flex-col">
                  <p className="my-1.5 pl-[18px] pr-6 text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted">
                    {t("sessions")}
                  </p>
                  <div className="flex flex-col gap-px pb-2">
                    {results.map((row, index) => (
                      <HomeSessionSearchRow
                        key={row.key}
                        row={row}
                        index={index}
                        active={index === active}
                        hideProjectName={hideProjectName}
                        onHover={() => setActive(index)}
                        onSelect={() => {
                          onOpenSession(row.path, row.sessionID);
                          closeSearch();
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <label className="relative z-20 flex h-9 w-full items-center gap-2 rounded-[6px] bg-bg-layer-02/60 py-1 ps-3 pe-2 text-icon-faint transition-[background-color,box-shadow] duration-[120ms] ease-in-out hover:bg-bg-layer-02 focus-within:bg-bg-layer-02">
        <Search className="size-4 shrink-0" />
        <input
          ref={searchInput}
          value={query}
          aria-label={t("searchSessions")}
          placeholder={t("searchSessions")}
          spellCheck={false}
          autoComplete="off"
          aria-expanded={panelOpen}
          aria-autocomplete="list"
          aria-controls={panelOpen ? "home-session-search-results" : undefined}
          aria-activedescendant={
            panelOpen && results[active] ? `home-session-search-option-${active}` : undefined
          }
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onQueryChange("");
              closeSearch();
              event.currentTarget.blur();
              return;
            }
            if (!panelOpen) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((current) => Math.min(Math.max(current + step, 0), Math.max(results.length - 1, 0)));
              return;
            }
            if (event.key === "Enter") {
              const row = results[active];
              if (!row) return;
              event.preventDefault();
              onOpenSession(row.path, row.sessionID);
              closeSearch();
            }
          }}
          className="relative z-20 min-w-0 flex-1 border-0 bg-transparent text-body font-[440] text-text-base outline-none placeholder:text-text-faint"
        />
        {query && (
          <button
            type="button"
            aria-label={t("clearSearch")}
            onClick={(event) => {
              event.preventDefault();
              onQueryChange("");
              searchInput.current?.focus();
            }}
            className="interactive relative z-20 grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
          >
            <X className="size-4" />
          </button>
        )}
      </label>
    </div>
  );
}