import type { SessionInfo } from "./types";

export interface SessionGroup {
  key: string;
  label: string;
  sessions: SessionInfo[];
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** groupByRecency buckets chats the way the design sidebar does. */
export function groupByRecency(sessions: SessionInfo[], now = new Date()): SessionGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets = [
    { key: "today", label: "Today", from: today, to: Number.POSITIVE_INFINITY },
    { key: "yesterday", label: "Yesterday", from: today - DAY, to: today },
    { key: "week", label: "Previous 7 days", from: today - 7 * DAY, to: today - DAY },
    { key: "month", label: "Previous 30 days", from: today - 30 * DAY, to: today - 7 * DAY },
    { key: "older", label: "Older", from: Number.NEGATIVE_INFINITY, to: today - 30 * DAY },
  ];

  const sorted = [...sessions].sort((a, b) => timestamp(b.updated) - timestamp(a.updated));
  const groups = buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, sessions: [] as SessionInfo[] }));
  for (const session of sorted) {
    const updated = timestamp(session.updated);
    const index = buckets.findIndex((bucket) => updated >= bucket.from && updated < bucket.to);
    groups[index === -1 ? groups.length - 1 : index].sessions.push(session);
  }
  return groups.filter((group) => group.sessions.length > 0);
}

/** relativeTime is the quiet timestamp shown on a resting row. */
export function relativeTime(iso: string, now = new Date()): string {
  const updated = timestamp(iso);
  if (!Number.isFinite(updated)) return "";
  const diff = now.getTime() - updated;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return new Date(updated).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** workspaceName is the last path segment, used as the workspace title. */
export function workspaceName(path: string): string {
  if (!path) return "workspace";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** shortPath keeps the tail of a long path readable in a narrow sidebar. */
export function shortPath(path: string, max = 34): string {
  if (!path || path.length <= max) return path;
  return `…${path.slice(-(max - 1))}`;
}

function timestamp(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}
