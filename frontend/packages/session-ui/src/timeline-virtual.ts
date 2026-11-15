import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type VirtualItem,
} from "@tanstack/virtual-core";

export type { VirtualItem };

/** jsdom reports a zero viewport; keep a usable window for range math. */
const observeRect = (instance: Virtualizer<HTMLElement, HTMLElement>, callback: (rect: { width: number; height: number }) => void) =>
  observeElementRect(instance, (rect) => {
    if (import.meta.env.MODE === "test" && rect.height === 0) {
      callback({ width: rect.width || 800, height: 600 });
      return;
    }
    callback(rect);
  });

function measureTimelineRow(element: Element) {
  const height = element.getBoundingClientRect().height;
  return height > 0 ? height : import.meta.env.MODE === "test" ? 84 : 0;
}

/** Framework-neutral observers the core expects. */
export const timelineVirtualDefaults = {
  observeElementRect: observeRect,
  observeElementOffset,
  scrollToFn: elementScroll,
  measureElement: measureTimelineRow,
};

/**
 * Transcript rows use the same TanStack virtual core as the reference timeline:
 * absolute rows, measured heights and scroll anchoring handled by the engine.
 */
export function createTimelineVirtualizer(input: {
  count: number;
  getScrollElement: () => HTMLElement | null;
  getItemKey: (index: number) => string;
  onChange: () => void;
  estimate?: number;
}) {
  return new Virtualizer({
    ...timelineVirtualDefaults,
    count: input.count,
    getScrollElement: input.getScrollElement,
    getItemKey: input.getItemKey,
    estimateSize: () => input.estimate ?? 84,
    overscan: 8,
    onChange: input.onChange,
    initialRect: { width: 0, height: 0 },
    scrollMargin: 0,
    gap: 0,
  });
}
