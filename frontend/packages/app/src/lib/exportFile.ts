/**
 * Shared helpers for exported JSON/Markdown filenames. Every export dialog
 * used to carry its own copy of the timestamp and safe-name logic, which made
 * the generated names drift between features.
 */

/** Builds the YYYYMMDD-HHMM stamp shared by export filenames. */
export function exportStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/**
 * Makes one filename segment filesystem-safe. Passing `basename` keeps the
 * last path segment, which workspace-scoped exports use.
 */
export function exportSafeName(value: string, fallback: string, basename = false): string {
  const source = basename ? value.split(/[\\/]/).filter(Boolean).pop() ?? value : value;
  return (
    source
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/^\.+/, "")
      .trim() || fallback
  );
}

/** Turns free text into a lowercase slug for query-named exports. */
export function exportSlug(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || fallback
  );
}

/**
 * Builds an export filename in the one shape every feature uses:
 * `<subject>-<kind>[-<count>]-<stamp>.<ext>`. Subjects from free text pass
 * `slug`, workspace paths pass `basename`.
 */
export function exportName(
  subject: string,
  kind: string,
  options: {
    count?: number;
    date?: Date;
    extension?: string;
    slug?: boolean;
    basename?: boolean;
    fallback?: string;
  } = {},
): string {
  const safe = options.slug
    ? exportSlug(subject, options.fallback ?? kind)
    : exportSafeName(subject, options.fallback ?? kind, options.basename);
  const count = options.count === undefined ? "" : `-${options.count}`;
  const extension = (options.extension ?? "json").replace(/^\./, "");
  return `${safe}-${kind}${count}-${exportStamp(options.date)}.${extension}`;
}

/**
 * Serializes one export document with the two-space indent every export uses.
 * Each feature keeps its own field order, so the output stays byte-identical.
 */
export function exportJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/** The `exportedAt` timestamp every export document carries. */
export function exportedAt(date?: Date): string {
  return (date ?? new Date()).toISOString();
}

