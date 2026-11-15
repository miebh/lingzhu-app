import { currentLanguage } from "./i18n";

/** Duration for a settled or running turn: 8.4s, 2m 42s. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${(Math.round(seconds * 10) / 10).toFixed(1)}s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

/** Compact running-job clock with a padded trailing unit: 12s, 1m 05s, 1h 02m. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${pad(total % 60)}s`;
  return `${Math.floor(total / 3600)}h ${pad(Math.floor(total / 60) % 60)}m`;
}

/** Sent time in the user menu: Today, 3:42 PM / Mar 5, 3:42 PM / Mar 5, 2025, 3:42 PM. */
export function formatMessageTime(created: string): string {
  const date = new Date(created);
  if (Number.isNaN(date.getTime())) return "";

  const locale = currentLanguage() === "zh" ? "zh-CN" : "en";
  const now = new Date();
  const midnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(date)) / 86_400_000);
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);

  if (days === 0 || days === 1) {
    const day = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
    return `${day.charAt(0).toLocaleUpperCase(locale)}${day.slice(1)}, ${time}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Local date and time for stored timestamps; blank when missing or invalid. */
export function formatDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1) return "";
  return date.toLocaleString(currentLanguage() === "zh" ? "zh-CN" : "en");
}

/** Clock time only, for same-day streams such as logs and inbox items. */
export function formatTimeOfDay(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(currentLanguage() === "zh" ? "zh-CN" : "en");
}

/** Compact token count the header shows: 12.4k, 1.2M. */
export function formatTokensCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const locale = currentLanguage() === "zh" ? "zh-CN" : "en";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 0 }).format(value);
}

/** Whole token count with grouping: 12,431. */
export function formatTokens(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const locale = currentLanguage() === "zh" ? "zh-CN" : "en";
  return Math.round(value).toLocaleString(locale);
}

/** File size with one decimal from KB up: 512 B, 2.0 KB, 3.4 MB, 1.2 GB. */
export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Drops ANSI escapes and lone carriage returns from terminal output. */
export function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*\u0007/g, "")
    .replace(/\r(?!\n)/g, "");
}
