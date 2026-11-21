import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Search, X } from "@lingzhu/ui/icons";
import { t } from "@lingzhu/ui/i18n";
import type { HomeSessionRow as HomeSessionRowData } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../workspace/ProjectAvatar";

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
function HomeSessionSearchRow(props: RowProps) {
  return (
    <button
      id={`home-session-search-option-${props.index}`}
      type="button"
      role="option"
      aria-selected={props.active}
      data-active={props.active ? "" : undefined}
      data-component="home-session-search-row"
      onMouseEnter={() => props.onHover()}
      onClick={() => props.onSelect()}
      class={`flex h-10 w-full shrink-0 items-center gap-1.5 py-3 pl-[18px] pr-6 text-left ${
        props.active ? "bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]" : ""
      }`}
    >
      <ProjectAvatar name={props.row.workspaceName} icon={props.row.icon} color={props.row.color} />
      <span
        data-component="home-session-title"
        class="min-w-0 truncate text-body leading-4 font-[530] tracking-[-0.04px] text-text-base"
      >
        {props.row.title}
      </span>
      <Show when={!props.hideProjectName}>
        <span
          data-component="home-session-project-name"
          class="min-w-0 shrink-0 truncate text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted"
        >
          {props.row.workspaceName}
        </span>
      </Show>
    </button>
  );
}

/** The home session search box and its suggestion panel. */
export function HomeSessionSearch(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let searchRoot: HTMLDivElement | undefined;
  let searchInput: HTMLInputElement | undefined;

  const results = createMemo(() => {
    const term = props.query.trim().toLowerCase();
    const list = term
      ? props.rows.filter((row) => `${row.title} ${row.workspaceName}`.toLowerCase().includes(term))
      : props.rows;
    return list.slice(0, 10);
  });

  createEffect(() => {
    props.query;
    setActive(0);
  });

  const panelOpen = createMemo(() => open() && props.query.trim() !== "");

  const closeSearch = () => {
    setOpen(false);
    setActive(0);
  };

  return (
    <div
      ref={(element) => {
        searchRoot = element;
      }}
      data-component="home-session-search"
      class="relative z-30 w-full"
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && searchRoot?.contains(event.relatedTarget)) return;
        closeSearch();
      }}
    >
      <Show when={panelOpen()}>
        <div
          data-component="home-session-search-panel"
          onMouseDown={(event) => event.preventDefault()}
          class="absolute z-10 flex flex-col overflow-hidden rounded-xl bg-bg-base elevation-floating"
          style={{ top: "-6px", "inset-inline-start": "-6px", width: "calc(100% + 12px)" }}
        >
          <div class="flex flex-col pt-9">
            <div
              id="home-session-search-results"
              role="listbox"
              aria-label={t("sessionSearchResults")}
              class="flex flex-col gap-4 pt-4"
            >
              <Show
                when={results().length > 0}
                fallback={
                  <p class="my-1.5 px-4 pb-2 text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted">
                    {t("noSessionsFound", { query: props.query.trim() })}
                  </p>
                }
              >
                <div class="flex flex-col">
                  <p class="my-1.5 pl-[18px] pr-6 text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted">
                    {t("sessions")}
                  </p>
                  <div class="flex flex-col gap-px pb-2">
                    <For each={results()}>
                      {(row, index) => (
                        <HomeSessionSearchRow
                          row={row}
                          index={index()}
                          active={index() === active()}
                          hideProjectName={props.hideProjectName}
                          onHover={() => setActive(index())}
                          onSelect={() => {
                            props.onOpenSession(row.path, row.sessionID);
                            closeSearch();
                          }}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
      <label class="relative z-20 flex h-9 w-full items-center gap-2 rounded-[6px] bg-bg-layer-02/60 py-1 ps-3 pe-2 text-icon-faint transition-[background-color,box-shadow] duration-[120ms] ease-in-out hover:bg-bg-layer-02 focus-within:bg-bg-layer-02">
        <Search class="size-4 shrink-0" />
        <input
          ref={(element) => {
            searchInput = element;
          }}
          value={props.query}
          aria-label={t("searchSessions")}
          placeholder={t("searchSessions")}
          spellcheck={false}
          autocomplete="off"
          aria-expanded={panelOpen()}
          aria-autocomplete="list"
          aria-controls={panelOpen() ? "home-session-search-results" : undefined}
          aria-activedescendant={
            panelOpen() && results()[active()] ? `home-session-search-option-${active()}` : undefined
          }
          onFocus={() => setOpen(true)}
          onInput={(event) => {
            props.onQueryChange(event.currentTarget.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onQueryChange("");
              closeSearch();
              event.currentTarget.blur();
              return;
            }
            if (!panelOpen()) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              update(setActive, active, (current) =>
                Math.min(Math.max(current + step, 0), Math.max(results().length - 1, 0)),
              );
              return;
            }
            if (event.key === "Enter") {
              const row = results()[active()];
              if (!row) return;
              event.preventDefault();
              props.onOpenSession(row.path, row.sessionID);
              closeSearch();
            }
          }}
          class="relative z-20 min-w-0 flex-1 border-0 bg-transparent text-body font-[440] text-text-base outline-none placeholder:text-text-faint"
        />
        <Show when={props.query}>
          <button
            type="button"
            aria-label={t("clearSearch")}
            onClick={(event) => {
              event.preventDefault();
              props.onQueryChange("");
              searchInput?.focus();
            }}
            class="interactive relative z-20 grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
          >
            <X class="size-4" />
          </button>
        </Show>
      </label>
    </div>
  );
}
