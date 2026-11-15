import type { ReactNode } from "react";
import { RefreshCw } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";

/** Outline refresh button that spins while the owning dialog reloads. */
export function RefreshButton({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
      <RefreshCw className={loading ? "motion-safe:animate-spin" : undefined} />
      Refresh
    </Button>
  );
}

/** Inline dialog error banner; `className` carries the owning dialog's margin. */
export function ErrorBanner({
  error,
  className = "mt-3 shrink-0",
}: {
  error?: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      className={`${className} rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger select-text`}
    >
      {error}
    </div>
  );
}

/** Informational banner under a dialog header. */
export function NoticeBanner({
  notice,
  mono = false,
  shrink = false,
}: {
  notice?: string;
  mono?: boolean;
  shrink?: boolean;
}) {
  if (!notice) return null;
  return (
    <div
      className={`${shrink ? "shrink-0 " : ""}mt-3 ${mono ? "truncate " : ""}rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 ${mono ? "font-mono text-caption" : "text-meta"} text-text-muted select-text`}
    >
      {notice}
    </div>
  );
}

/** Label/value row for read-only metadata dialogs; `dense` uses the 6px rhythm. */
export function DetailRow({ label, value, dense = false }: { label: string; value: ReactNode; dense?: boolean }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 border-b border-border-base px-3 ${dense ? "py-1.5" : "py-2"} text-meta last:border-b-0`}
    >
      <span className="shrink-0 text-text-faint">{label}</span>
      <span className="min-w-0 break-all text-right font-mono text-text-muted">{value || "—"}</span>
    </div>
  );
}
