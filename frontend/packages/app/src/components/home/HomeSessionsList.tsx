import { useMemo, useState } from "react";
import { Pencil } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { t, useLanguage } from "@lingzhu/ui/i18n";
import type { HomeSessionRow as HomeSessionRowData, WorkspaceInfo } from "@lingzhu/ui/types";
import { HomeSessionGroup, type HomeSessionGroupData } from "./HomeSessionGroup";
import { HomeSessionSearch } from "./HomeSessionSearch";

interface Props {
  /** Newest first, already capped to the home limit. */
  rows: HomeSessionRowData[];
  openKeys?: ReadonlySet<string>;
  hideProjectName: boolean;
  loading: boolean;
  activePath?: string;
  /** Only used to decide whether the empty state can start a session. */
  workspaces: WorkspaceInfo[];
  onOpenSession: (path: string, sessionID: string) => void;
  onNewSession: (path: string) => void;
  onRowContextMenu?: (row: HomeSessionRowData, x: number, y: number) => void;
}

/** The skeleton row shown while the first session page loads. */
function HomeSessionSkeleton() {
  return (
    <div
      data-component="home-session-skeleton"
      data-visible=""
      className="flex h-10 min-w-0 items-center gap-1.5 py-3 ps-1.5 pe-3 md:ps-3"
    >
      <span className="size-4 shrink-0 rounded-[4px] bg-bg-layer-02" />
      <span className="h-3 w-[46%] shrink-0 rounded-[3px] bg-bg-layer-02" />
    </div>
  );
}

/** Local midnight of a timestamp, so grouping follows the user's day. */
function localDay(value: string): number {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return Number.NaN;
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** The sessions column: search, the new-session action and the dated list. */
export function HomeSessionsList({
  rows,
  openKeys,
  hideProjectName,
  loading,
  activePath,
  workspaces,
  onOpenSession,
  onNewSession,
  onRowContextMenu,
}: Props) {
  const [query, setQuery] = useState("");
  const language = useLanguage();

  // The reference buckets by local day: today, yesterday, then everything else.
  const groups = useMemo<HomeSessionGroupData[]>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const todayRows: HomeSessionRowData[] = [];
    const yesterdayRows: HomeSessionRowData[] = [];
    const olderRows: HomeSessionRowData[] = [];
    for (const row of rows) {
      const day = localDay(row.updated);
      if (day === today) todayRows.push(row);
      else if (day === yesterday) yesterdayRows.push(row);
      else olderRows.push(row);
    }
    const olderTitle = todayRows.length === 0 && yesterdayRows.length === 0 ? t("recentSessions") : t("older");
    // `language` is a dependency because every title above is translated.
    return [
      { id: "today", title: t("today"), rows: todayRows },
      { id: "yesterday", title: t("yesterday"), rows: yesterdayRows },
      { id: "older", title: olderTitle, rows: olderRows },
    ].filter((group) => group.rows.length > 0);
  }, [rows, language]);

  const skeletons = loading && rows.length === 0;

  return (
    <section aria-label={t("recentSessions")} className="relative flex min-w-0 flex-col">
      <div className="sticky top-0 z-30 flex shrink-0 flex-col gap-2 bg-bg-base pt-6 pb-1 md:pb-3 lg:pt-12">
        <HomeSessionSearch
          rows={rows}
          query={query}
          onQueryChange={setQuery}
          hideProjectName={hideProjectName}
          onOpenSession={onOpenSession}
        />
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
        {skeletons && [0, 1, 2, 3].map((index) => <HomeSessionSkeleton key={index} />)}

        {!skeletons &&
          groups.map((group) => (
            <HomeSessionGroup
              key={group.id}
              group={group}
              openKeys={openKeys}
              hideProjectName={hideProjectName}
              onOpenSession={onOpenSession}
              onRowContextMenu={onRowContextMenu}
            />
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
  );
}