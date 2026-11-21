import { currentLanguage, t } from "@lingzhu/ui/i18n";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** relativeTime is the quiet timestamp shown on a resting session row. */
export function relativeTime(iso: string, now = new Date()): string {
  const updated = timestamp(iso);
  if (!Number.isFinite(updated)) return "";
  const diff = now.getTime() - updated;
  if (diff < MINUTE) return t("relativeNow");
  if (diff < HOUR) return t("relativeMinutes", { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t("relativeHours", { count: Math.floor(diff / HOUR) });
  if (diff < 7 * DAY) return t("relativeDays", { count: Math.floor(diff / DAY) });
  return new Date(updated).toLocaleDateString(currentLanguage() === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
  });
}

/** workspaceName is the last path segment, used as the workspace title. */
export function workspaceName(path: string): string {
  if (!path) return "workspace";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function timestamp(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}
