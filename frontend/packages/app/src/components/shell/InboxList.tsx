import { useState } from "react";
import { ProjectAvatar } from "../workspace/ProjectAvatar";
import type { InboxEntry, InboxStatus } from "@lingzhu/ui/types";

interface Props {
  entries: InboxEntry[];
  activeKey?: string;
  onOpen: (entry: InboxEntry) => void;
}

const RECENT_LIMIT = 10;

const STATUS_DOT: Record<InboxStatus, string> = {
  needs: "bg-state-fg-warning",
  working: "bg-text-accent",
  failed: "bg-state-fg-danger",
  ready: "bg-bg-layer-04",
};

/** The status dot trailing one inbox row. */
function InboxStatusDot({ status }: { status: InboxStatus }) {
  return (
    <span className="ms-auto flex shrink-0 items-center gap-1.5 text-meta tabular-nums">
      <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${STATUS_DOT[status]}`} />
    </span>
  );
}

/** One inbox row: workspace avatar, session title, workspace name and status. */
function InboxRow({
  entry,
  selected,
  onOpen,
}: {
  entry: InboxEntry;
  selected: boolean;
  onOpen: (entry: InboxEntry) => void;
}) {
  return (
    <button
      type="button"
      data-state={selected ? "active" : undefined}
      onClick={() => onOpen(entry)}
      className={`interactive flex h-[54px] w-full shrink-0 flex-col gap-1.5 rounded-md p-2 text-start ${
        selected
          ? "bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] text-text-base"
          : "text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
      }`}
    >
      <span className="flex h-4 w-full min-w-0 shrink-0 items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center">
          <ProjectAvatar name={entry.workspaceName} />
        </span>
        <span className="min-w-0 flex-1 truncate text-body leading-4 font-[530] tracking-[-0.04px]">
          {entry.title}
        </span>
      </span>
      <span className="flex h-4 w-full min-w-0 shrink-0 items-center gap-2 ps-6 text-body leading-4 tracking-[-0.04px] text-text-muted">
        <span className="min-w-0 flex-1 truncate">{entry.workspaceName}</span>
        <InboxStatusDot status={entry.status} />
      </span>
    </button>
  );
}

/** The sticky heading of one inbox group with its row count. */
function InboxSectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 px-2 text-body leading-4 font-[530] text-text-muted">
      <span className="truncate">{label}</span>
      <span className="ms-auto shrink-0 text-meta tabular-nums text-text-faint">{count}</span>
    </div>
  );
}

/** One status group: its heading, rows and an optional show-more control. */
function InboxSection({
  label,
  rows,
  activeKey,
  onOpen,
  onShowMore,
  expanded,
}: {
  label: string;
  rows: InboxEntry[];
  activeKey?: string;
  onOpen: (entry: InboxEntry) => void;
  onShowMore?: () => void;
  expanded?: boolean;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 pb-2.5">
      <InboxSectionHeader label={label} count={rows.length} />
      <div className="flex flex-col gap-0.5">
        {rows.map((entry) => (
          <InboxRow key={entry.key} entry={entry} selected={entry.key === activeKey} onOpen={onOpen} />
        ))}
      </div>
      {onShowMore && (
        <button
          type="button"
          onClick={onShowMore}
          className="interactive flex h-6 w-full items-center rounded-md px-2 text-body leading-4 font-[530] text-text-muted hover:text-text-base"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * The session inbox: every session across workspaces grouped by what it needs,
 * newest first within each group. Mirrors the reference inbox rail.
 */
export function InboxList({ entries, activeKey, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false);

  const needs = entries
    .filter((entry) => entry.status === "needs")
    .sort((left, right) => left.updated.localeCompare(right.updated));
  const working = entries
    .filter((entry) => entry.status === "working")
    .sort((left, right) => right.updated.localeCompare(left.updated));
  const failed = entries
    .filter((entry) => entry.status === "failed")
    .sort((left, right) => right.updated.localeCompare(left.updated));
  const ready = entries
    .filter((entry) => entry.status === "ready")
    .sort((left, right) => right.updated.localeCompare(left.updated));

  const sections: { id: string; label: string; rows: InboxEntry[] }[] = [];
  if (needs.length > 0) sections.push({ id: "needs", label: "Needs attention", rows: needs });
  if (working.length > 0) sections.push({ id: "working", label: "Working", rows: working });
  if (failed.length > 0) sections.push({ id: "failed", label: "Unread", rows: failed });
  if (ready.length > 0) {
    sections.push({ id: "recent", label: "Recent", rows: expanded ? ready : ready.slice(0, RECENT_LIMIT) });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-1 no-scrollbar">
      {sections.length === 0 && (
        <p className="px-2 py-3 text-body text-text-muted">No sessions yet.</p>
      )}
      {sections.map((section) => (
        <InboxSection
          key={section.id}
          label={section.label}
          rows={section.rows}
          activeKey={activeKey}
          onOpen={onOpen}
          expanded={expanded}
          onShowMore={
            section.id === "recent" && ready.length > RECENT_LIMIT
              ? () => setExpanded((value) => !value)
              : undefined
          }
        />
      ))}
    </div>
  );
}
