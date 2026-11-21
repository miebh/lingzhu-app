import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { RefreshCw } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";

/** Outline refresh button that spins while the owning dialog reloads. */
export function RefreshButton(props: { loading: boolean; onRefresh: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={props.loading} onClick={props.onRefresh}>
      <RefreshCw class={props.loading ? "motion-safe:animate-spin" : undefined} />
      Refresh
    </Button>
  );
}

/** Inline dialog error banner; `class` carries the owning dialog's margin. */
export function ErrorBanner(props: { error?: string; class?: string }) {
  return (
    <Show when={props.error}>
      <div
        class={`${props.class ?? "mt-3 shrink-0"} rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger select-text`}
      >
        {props.error}
      </div>
    </Show>
  );
}

/** Informational banner under a dialog header. */
export function NoticeBanner(props: { notice?: string; mono?: boolean; shrink?: boolean }) {
  return (
    <Show when={props.notice}>
      <div
        class={`${props.shrink ? "shrink-0 " : ""}mt-3 ${props.mono ? "truncate " : ""}rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 ${props.mono ? "font-mono text-caption" : "text-meta"} text-text-muted select-text`}
      >
        {props.notice}
      </div>
    </Show>
  );
}

/** Label/value row for read-only metadata dialogs; `dense` uses the 6px rhythm. */
export function DetailRow(props: { label: string; value: JSX.Element; dense?: boolean }) {
  return (
    <div
      class={`flex items-start justify-between gap-4 border-b border-border-base px-3 ${props.dense ? "py-1.5" : "py-2"} text-meta last:border-b-0`}
    >
      <span class="shrink-0 text-text-faint">{props.label}</span>
      <span class="min-w-0 break-all text-right font-mono text-text-muted">{props.value || "—"}</span>
    </div>
  );
}
