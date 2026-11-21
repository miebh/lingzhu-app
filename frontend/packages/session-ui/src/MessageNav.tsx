import { createMemo, createSignal, For, Show } from "solid-js";
import { diffTotals, type TimelineRow } from "@lingzhu/session-ui/timeline";

/** One prompt in the transcript, as the navigator sees it. */
export interface MessageNavItem {
  key: string;
  label: string;
  /** Line totals for the turn that follows this prompt. */
  added: number;
  removed: number;
}

/**
 * Groups timeline rows into navigator entries: each prompt owns the tools and
 * diffs up to the next prompt, which is what its tick scrolls to and what its
 * change bars summarize.
 */
export function messageNavItems(rows: TimelineRow[]): MessageNavItem[] {
  const items: MessageNavItem[] = [];
  let current: { key: string; label: string; diffs: (string | undefined)[] } | undefined;

  const flush = () => {
    if (!current) return;
    const totals = diffTotals(current.diffs);
    items.push({
      key: current.key,
      label: current.label,
      added: totals?.added ?? 0,
      removed: totals?.removed ?? 0,
    });
    current = undefined;
  };

  for (const row of rows) {
    if (row.entry?.role === "user") {
      flush();
      current = { key: row.entry.key, label: firstLine(row.entry.text ?? ""), diffs: [] };
      continue;
    }
    if (!current) continue;
    if (row.tool?.diff) current.diffs.push(row.tool.diff);
    if (row.read) for (const tool of row.read) if (tool.diff) current.diffs.push(tool.diff);
    if (row.files) for (const tool of row.files) if (tool.diff) current.diffs.push(tool.diff);
    if (row.parts) {
      for (const part of row.parts) if (part.kind === "tool" && part.tool.diff) current.diffs.push(part.tool.diff);
    }
  }
  flush();
  return items;
}

function firstLine(text: string) {
  const line = text.split("\n").find((value) => value.trim() !== "") ?? "";
  return line.trim();
}

/**
 * Five bars that summarize a turn's change volume, the way the reference
 * navigator shows at a glance whether a turn mostly added or removed lines.
 */
function ChangeBars(props: { added: number; removed: number }) {
  const colors = createMemo(() => {
    const total = props.added + props.removed;
    if (total === 0) return Array(5).fill("var(--fg-icon-faint)");
    const addedBars =
      props.added === 0
        ? 0
        : Math.min(
            props.added <= 5 ? 1 : props.added <= 10 ? 2 : 4,
            Math.max(1, Math.round((props.added / total) * 4)),
          );
    const removedBars =
      props.removed === 0
        ? 0
        : Math.min(
            props.removed <= 5 ? 1 : props.removed <= 10 ? 2 : 4,
            Math.max(1, Math.round((props.removed / total) * 4)),
          );
    const overflow = Math.max(0, addedBars + removedBars - 5);
    const nextAdded = overflow > 0 && props.added >= props.removed ? addedBars - overflow : addedBars;
    const nextRemoved = overflow > 0 && props.added < props.removed ? removedBars - overflow : removedBars;
    return [
      ...Array(nextAdded).fill("var(--diff-add-fg)"),
      ...Array(nextRemoved).fill("var(--diff-remove-fg)"),
      ...Array(Math.max(0, 5 - nextAdded - nextRemoved)).fill("var(--fg-icon-faint)"),
    ];
  });

  return (
    <svg data-slot="message-nav-diff-bars" viewBox="0 0 18 14" aria-hidden="true" class="size-[18px] shrink-0">
      <For each={colors().slice(0, 5)}>
        {(color, index) => <rect x={index() * 4} width="2" height="14" rx="1" fill={color} />}
      </For>
    </svg>
  );
}

/**
 * The transcript's turn navigator: one tick per prompt down the trailing edge,
 * with a hover card listing every prompt so a long session stays jumpable.
 */
export function MessageNav(props: {
  items: MessageNavItem[];
  current?: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = createSignal(false);

  return (
    <Show when={props.items.length >= 2}>
      <div
        data-component="message-nav"
        class="absolute end-1 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-end gap-1 md:flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <ul role="list" class="flex flex-col items-end gap-1 py-1">
          <For each={props.items}>
            {(item) => (
              <li data-slot="message-nav-item">
                <button
                  type="button"
                  data-slot="message-nav-tick-button"
                  data-active={item.key === props.current ? "true" : undefined}
                  aria-label={`Jump to ${item.label || "message"}`}
                  aria-current={item.key === props.current ? "true" : undefined}
                  onClick={() => props.onSelect(item.key)}
                  class="group/tick grid h-2 w-4 place-items-center"
                >
                  <span
                    data-slot="message-nav-tick-line"
                    class="block h-0.5 w-2 rounded-full bg-border-strong transition-[width,background-color] group-hover/tick:w-4 group-data-[active=true]/tick:w-4 group-data-[active=true]/tick:bg-text-base"
                  />
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show when={open()}>
          <div
            data-slot="message-nav-hovercard-content"
            class="absolute end-6 top-1/2 max-h-80 w-64 -translate-y-1/2 overflow-y-auto rounded-md border-[0.5px] border-border-base bg-bg-layer-01 p-1 shadow-elevation-raised"
          >
            <ul role="list" class="flex flex-col">
              <For each={props.items}>
                {(item) => (
                  <li data-slot="message-nav-item">
                    <button
                      type="button"
                      data-slot="message-nav-message-button"
                      onClick={() => {
                        setOpen(false);
                        props.onSelect(item.key);
                      }}
                      class="flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
                    >
                      <ChangeBars added={item.added} removed={item.removed} />
                      <span
                        data-slot="message-nav-title-preview"
                        data-active={item.key === props.current ? "true" : undefined}
                        class="min-w-0 flex-1 truncate text-body leading-4 text-text-muted data-[active=true]:text-text-base"
                      >
                        {item.label || "New message"}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </Show>
  );
}
