import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipsis, FolderPlus, Pencil, Search, Settings2, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { ProjectAvatar } from "./ProjectAvatar";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { t, useLanguage } from "@lingzhu/ui/i18n";
import type { HomeSessionRow, WorkspaceInfo } from "@lingzhu/ui/types";

interface Props {
  workspaces: WorkspaceInfo[];
  /** Side tabs already own workspace identity; hide the duplicate Projects column. */
  hideProjects?: boolean;
  activePath?: string;
  /** Project row selected while the list is filtered; falls back to activePath when unset. */
  selectedPath?: string;
  /** Hide the repeated project name when the list already belongs to one project. */
  hideProjectName?: boolean;
  rows: HomeSessionRow[];
  /** Rows whose session is already open in a tab, marked like the reference. */
  openKeys?: ReadonlySet<string>;
  /** First load: the list renders skeletons until the rows arrive. */
  loading?: boolean;
  onOpenSession: (path: string, sessionID: string) => void;
  /** Selects a project for the home filter without leaving home. */
  onSelectWorkspace: (path: string) => void;
  /** Opens a project's conversation from its menu. */
  onOpenWorkspace?: (path: string) => void;
  onNewSession: (path: string) => void;
  onRename?: (row: HomeSessionRow) => void;
  onExport?: (row: HomeSessionRow) => void;
  onDelete?: (row: HomeSessionRow) => void;
  /** Projects column actions, matching the reference home utility nav. */
  onAddWorkspace?: () => void;
  onOpenSettings?: () => void;
}

/** The reference caps home at the newest 64 root sessions. */
const HOME_SESSION_LIMIT = 64;

/** Section labels are muted regular weight, not the row's medium weight. */
const SECTION_LABEL = "text-text-muted font-[440]";

/** Local midnight of a timestamp, so grouping follows the user's day. */
function localDay(value: string): number {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return Number.NaN;
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Home dashboard: a 1080px centred grid inside the session panel, a 280px
 * projects column and a sessions list whose rows are 40px, like the reference
 * home surface.
 */
export function HomeDashboard({
  workspaces,
  hideProjects = false,
  activePath,
  selectedPath,
  hideProjectName = false,
  rows,
  openKeys,
  loading = false,
  onOpenSession,
  onSelectWorkspace,
  onOpenWorkspace,
  onNewSession,
  onRename,
  onExport,
  onDelete,
  onAddWorkspace,
  onOpenSettings,
}: Props) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(0);
  const searchRoot = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ row: HomeSessionRow; x: number; y: number }>();
  const [projectMenu, setProjectMenu] = useState<string>();
  const [hovered, setHovered] = useState<string>();
  const language = useLanguage();

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => right.updated.localeCompare(left.updated)).slice(0, HOME_SESSION_LIMIT),
    [rows],
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? sortedRows.filter((row) => `${row.title} ${row.workspaceName}`.toLowerCase().includes(term))
      : sortedRows;
    return list.slice(0, 10);
  }, [sortedRows, query]);

  useEffect(() => {
    setSearchActive(0);
  }, [query]);

  // The reference buckets by local day: today, yesterday, then everything else.
  const groups = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const todayRows: HomeSessionRow[] = [];
    const yesterdayRows: HomeSessionRow[] = [];
    const olderRows: HomeSessionRow[] = [];
    for (const row of sortedRows) {
      const day = localDay(row.updated);
      if (day === today) todayRows.push(row);
      else if (day === yesterday) yesterdayRows.push(row);
      else olderRows.push(row);
    }
    const olderTitle = todayRows.length === 0 && yesterdayRows.length === 0 ? t("recentSessions") : t("older");
    return [
      { id: "today", title: t("today"), rows: todayRows },
      { id: "yesterday", title: t("yesterday"), rows: yesterdayRows },
      { id: "older", title: olderTitle, rows: olderRows },
    ].filter((group) => group.rows.length > 0);
  }, [sortedRows, language]);

  const panelOpen = searchOpen && query.trim() !== "";
  const skeletons = loading && rows.length === 0;

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchActive(0);
  };

  return (
    <div data-slot="home-panel" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div
          className={`mx-auto grid min-h-full w-full gap-4 px-3 lg:grid-rows-1 lg:gap-8 lg:px-6 ${
            hideProjects
              ? "max-w-[720px] grid-rows-[minmax(0,1fr)]"
              : "max-w-[1080px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,720px)]"
          }`}
        >
          {!hideProjects && (
            <section aria-label={t("projects")} className="flex min-w-0 flex-col lg:sticky lg:top-14 lg:self-start lg:pt-[52px]">
              <div className="flex h-7 min-w-0 shrink-0 items-center justify-between ps-1.5 pe-3">
                <span className="min-w-0 truncate text-body leading-4 font-[530] text-text-muted">{t("projects")}</span>
                {onAddWorkspace && (
                  <button
                    type="button"
                    aria-label={t("addProject")}
                    title={t("addProject")}
                    onClick={onAddWorkspace}
                    className="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
                  >
                    <FolderPlus className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-2.5 flex min-h-0 flex-col gap-0.5 pb-2 lg:pr-3">
                {workspaces.map((workspace) => {
                  const selected = workspace.path === (selectedPath ?? activePath);
                  return (
                    <div
                      key={workspace.path}
                      data-home-row
                      data-component="home-project-row"
                      data-selected={selected ? "true" : undefined}
                      data-menu={projectMenu === workspace.path ? "true" : undefined}
                      className="group/project relative flex h-7 min-w-0 items-center rounded-[6px]"
                    >
                      <button
                        type="button"
                        aria-current={selected ? "page" : undefined}
                        onClick={() => onSelectWorkspace(workspace.path)}
                        className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1.5 text-left text-body font-[440] text-text-muted group-hover/project:text-text-base group-data-[selected=true]/project:text-text-base focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--border-muted)]"
                      >
                        <ProjectAvatar name={workspace.name} icon={workspace.icon} color={workspace.color} />
                        <span data-slot="home-row-label" className="min-w-0 flex-1 truncate">
                          {workspace.name}
                        </span>
                      </button>
                      <span
                        data-slot="home-row-actions"
                        className="pointer-events-none absolute inset-y-0 end-0 flex items-center rounded-e-[6px] pe-1 opacity-0 group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100 group-data-[menu=true]/project:pointer-events-auto group-data-[menu=true]/project:opacity-100"
                      >
                        <DropdownMenu onOpenChange={(open) => setProjectMenu(open ? workspace.path : undefined)}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={t("projectActions", { name: workspace.name })}
                              className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:text-text-base"
                            >
                              <Ellipsis className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={4} className="w-40">
                            <DropdownMenuItem onSelect={() => onNewSession(workspace.path)}>{t("newSession")}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => (onOpenWorkspace ?? onSelectWorkspace)(workspace.path)}>
                              {t("open")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </div>
                  );
                })}
                {workspaces.length === 0 && (
                  <button
                    type="button"
                    data-action="home-add-project-row"
                    onClick={onAddWorkspace}
                    disabled={!onAddWorkspace}
                    className="flex h-7 w-full items-center gap-2 rounded-[6px] px-1.5 text-body font-[440] text-text-muted hover:bg-bg-layer-01 hover:text-text-base focus-visible:bg-bg-layer-01 focus-visible:text-text-base focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--border-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FolderPlus className="size-4 shrink-0 text-text-muted" />
                    <span className="min-w-0 truncate">{t("addProject")}</span>
                  </button>
                )}
              </div>

              {onOpenSettings && (
                <div className="mb-8 mt-4 hidden shrink-0 flex-col gap-1 lg:flex">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="interactive flex h-7 w-full items-center gap-2 rounded-[6px] px-1.5 text-body font-[440] text-text-faint hover:text-text-base focus-visible:text-text-base focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--border-muted)]"
                  >
                    <Settings2 className="size-4 shrink-0 text-text-faint" />
                    <span className="min-w-0 flex-1 truncate text-left">{t("settings")}</span>
                  </button>
                </div>
              )}
            </section>
          )}

          <section aria-label={t("recentSessions")} className="relative flex min-w-0 flex-col">
            <div className="sticky top-0 z-30 flex shrink-0 flex-col gap-2 bg-bg-base pt-6 pb-1 md:pb-3 lg:pt-12">
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
                                <button
                                  key={row.key}
                                  id={`home-session-search-option-${index}`}
                                  type="button"
                                  role="option"
                                  aria-selected={index === searchActive}
                                  data-active={index === searchActive ? "" : undefined}
                                  data-component="home-session-search-row"
                                  onMouseEnter={() => setSearchActive(index)}
                                  onClick={() => {
                                    onOpenSession(row.path, row.sessionID);
                                    closeSearch();
                                  }}
                                  className={`flex h-10 w-full shrink-0 items-center gap-1.5 py-3 pl-[18px] pr-6 text-left ${
                                    index === searchActive
                                      ? "bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
                                      : ""
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
                      panelOpen && results[searchActive] ? `home-session-search-option-${searchActive}` : undefined
                    }
                    onFocus={() => setSearchOpen(true)}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSearchOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setQuery("");
                        closeSearch();
                        event.currentTarget.blur();
                        return;
                      }
                      if (!panelOpen) return;
                      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        const step = event.key === "ArrowDown" ? 1 : -1;
                        setSearchActive((current) =>
                          Math.min(Math.max(current + step, 0), Math.max(results.length - 1, 0)),
                        );
                        return;
                      }
                      if (event.key === "Enter") {
                        const row = results[searchActive];
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
                        setQuery("");
                        searchInput.current?.focus();
                      }}
                      className="interactive relative z-20 grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </label>
              </div>
            </div>

            {groups.length > 0 && (
              <div className="pointer-events-none absolute right-0 top-[68px] z-20 flex md:top-[84px] lg:top-[108px]">
                <button
                  type="button"
                  data-action="home-new-session"
                  onClick={() => onNewSession(activePath ?? rows[0]?.path ?? "")}
                  className="interactive pointer-events-auto flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-body font-[530] text-text-faint hover:text-text-base"
                >
                  <Pencil className="size-4 shrink-0" />
                  {t("newSession")}
                </button>
              </div>
            )}

            {/* The reference reserves a scrollbar thumb track beside the list. */}
            <div className="pointer-events-none sticky top-[68px] z-40 -mr-3 h-0 md:top-[84px] lg:top-[108px]">
              <div
                data-component="home-session-scroll-track"
                className="relative ml-auto h-[calc(100cqh-68px)] w-3 md:h-[calc(100cqh-84px)] lg:h-[calc(100cqh-108px)]"
              />
            </div>

            <div
              data-slot="home-sessions-list"
              className="relative -mr-3 min-h-[calc(100cqh-64px)] pb-16 pr-3 md:min-h-[calc(100cqh-72px)] lg:min-h-[calc(100cqh-96px)]"
              aria-busy={skeletons || undefined}
            >
              {skeletons &&
                [0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    data-component="home-session-skeleton"
                    data-visible=""
                    className="flex h-10 min-w-0 items-center gap-1.5 py-3 ps-1.5 pe-3 md:ps-3"
                  >
                    <span className="size-4 shrink-0 rounded-[4px] bg-bg-layer-02" />
                    <span className="h-3 w-[46%] shrink-0 rounded-[3px] bg-bg-layer-02" />
                  </div>
                ))}

              {!skeletons &&
                groups.map((group) => (
                  <div key={group.id} className="flex min-w-0 flex-col pt-1 md:pt-3">
                    <div
                      data-component="home-session-group-header"
                      className="pointer-events-none sticky top-[68px] z-10 flex h-7 min-w-0 items-center justify-between bg-bg-base ps-1.5 md:top-[84px] md:ps-3 lg:top-[108px]"
                    >
                      <div className={SECTION_LABEL}>{group.title}</div>
                    </div>
                    {group.rows.map((row) => {
                      const open = openKeys?.has(row.key) ?? false;
                      const showingLocation = hovered === row.key;
                      return (
                        <div
                          key={row.key}
                          data-component="home-session-row-container"
                          data-session-id={row.sessionID}
                          data-project-name="true"
                          className="group/session relative flex h-10 min-w-0 items-center rounded-[6px] outline-none focus:outline-none focus-visible:outline-none"
                          onContextMenu={(event) => {
                            if (!onRename && !onExport && !onDelete) return;
                            event.preventDefault();
                            setMenu({ row, x: event.clientX, y: event.clientY });
                          }}
                        >
                          <button
                            type="button"
                            data-component="home-session-row"
                            aria-haspopup="menu"
                            onClick={() => onOpenSession(row.path, row.sessionID)}
                            onMouseEnter={() => setHovered(row.key)}
                            onMouseLeave={() => setHovered((current) => (current === row.key ? undefined : current))}
                            className="flex h-10 min-w-0 w-full flex-1 shrink-0 items-center gap-1.5 rounded-[6px] border-0 bg-transparent py-3 ps-1.5 pe-3 text-start text-text-muted font-[530] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-none md:ps-3"
                          >
                            <span className="relative flex shrink-0 items-center">
                              {open && (
                                <span
                                  aria-label={t("openInTab")}
                                  className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-[2px] bg-bg-layer-04"
                                  style={{ right: "calc(100% + 4px)" }}
                                />
                              )}
                              <ProjectAvatar name={row.workspaceName} icon={row.icon} color={row.color} />
                            </span>
                            <span data-slot="home-session-labels" className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span
                                data-component="home-session-title"
                                dir="auto"
                                className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-body leading-4 font-[530] tracking-[-0.04px] text-text-base"
                              >
                                {row.title}
                              </span>
                              {!hideProjectName && (
                                <span
                                  data-component="home-session-project-name"
                                  dir="auto"
                                  aria-hidden={showingLocation || undefined}
                                  className={`min-w-0 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted transition-[max-width,opacity] duration-[120ms] ease-out ${
                                    showingLocation ? "max-w-0 opacity-0" : "max-w-[60%] opacity-100"
                                  }`}
                                >
                                  {row.workspaceName}
                                </span>
                              )}
                              <span
                                data-slot="home-session-location"
                                dir="ltr"
                                aria-hidden={!showingLocation || undefined}
                                className={`flex min-w-0 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted transition-[max-width,opacity] duration-[120ms] ease-out ${
                                  showingLocation ? "max-w-[60%] opacity-100" : "-ms-1.5 max-w-0 opacity-0"
                                }`}
                              >
                                <span className="min-w-0 overflow-hidden text-ellipsis">{row.path}</span>
                              </span>
                            </span>
                            {row.running && <ActivityRing />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}

              {!skeletons && rows.length === 0 && (
                <div className="flex min-h-full flex-col items-center gap-4 px-6 pt-[52px] text-center">
                  <div className="shrink-0 text-body leading-4 font-[530] tracking-[-0.04px] text-text-base">
                    {query.trim() ? t("noSessionsFound", { query: query.trim() }) : t("nothingHereYet")}
                  </div>
                  {!query.trim() && (
                    <>
                      <p className="mb-1 text-center text-body leading-5 font-[440] tracking-[-0.04px] text-text-muted">
                        {t("startSession")}
                      </p>
                      <Button
                        data-action="home-new-session"
                        variant="neutral"
                        size="default"
                        disabled={!activePath && workspaces.length === 0}
                        onClick={() => onNewSession(activePath ?? workspaces[0]?.path ?? "")}
                      >
                        <Pencil className="size-4" />
                        {t("newSession")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Below the wide layout the projects column is stacked and its utility
          nav collapses to the panel footer, like the reference home. */}
      {onOpenSettings && (
        <div className="hidden shrink-0 items-center justify-between gap-1 border-t border-border-weak px-3 py-2 md:flex lg:hidden">
          <button
            type="button"
            onClick={onOpenSettings}
            className="interactive flex h-7 min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-body font-[440] text-text-faint hover:text-text-base"
          >
            <Settings2 className="size-4 shrink-0" />
            <span className="truncate">{t("settings")}</span>
          </button>
        </div>
      )}

      {menu && (
        <div
          role="menu"
          aria-label={t("sessionActions")}
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          className="fixed z-50 flex w-40 flex-col gap-0.5 rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
        >
          {onRename && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const row = menu.row;
                setMenu(undefined);
                onRename(row);
              }}
              className="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
            >
              {t("renamePlain")}
            </button>
          )}
          {onExport && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const row = menu.row;
                setMenu(undefined);
                onExport(row);
              }}
              className="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
            >
              {t("export")}
            </button>
          )}
          {onDelete && (
            <>
              <span className="my-0.5 h-px bg-border-weak" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const row = menu.row;
                  setMenu(undefined);
                  onDelete(row);
                }}
                className="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-state-fg-danger hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
              >
                {t("delete")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

