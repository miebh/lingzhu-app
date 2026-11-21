import {
  createVirtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type Rect,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/solid-virtual";

export type { VirtualItem };

/** jsdom reports a zero viewport; keep a usable window for range math. */
const observeRect = (instance: Virtualizer<HTMLElement, Element>, callback: (rect: Rect) => void) =>
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
 * Transcript rows use the official Solid adapter: the row count and key lookup
 * are reactive getters, so streamed rows reconfigure the engine without a
 * manual setOptions effect.
 */
export function createTimelineVirtualizer(input: {
  count: () => number;
  getScrollElement: () => HTMLElement | null;
  getItemKey: (index: number) => string;
  onChange: () => void;
  estimate?: number;
}) {
  return createVirtualizer({
    ...timelineVirtualDefaults,
    get count() {
      return input.count();
    },
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
