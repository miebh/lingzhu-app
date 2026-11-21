class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as typeof ResizeObserver;

class IntersectionObserverStub {
  root = null;
  rootMargin = "0px";
  thresholds = [0];
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          time: 0,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;
HTMLElement.prototype.scrollTo ??= () => undefined;
HTMLElement.prototype.scrollIntoView ??= () => undefined;
// A functional stub: media primitives read `matches` and listen for `change`,
// while tests move the mobile breakpoint by changing `window.innerWidth`.
const mediaLists = new Set<{ query: string; listeners: Set<(event: MediaQueryListEvent) => void> }>();
window.matchMedia = ((query: string) => {
  const entry = { query, listeners: new Set<(event: MediaQueryListEvent) => void>() };
  mediaLists.add(entry);
  return {
    get matches() {
      return /max-width:\s*767px/.test(query) ? window.innerWidth <= 767 : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => entry.listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      entry.listeners.delete(listener),
    addListener: (listener: (event: MediaQueryListEvent) => void) => entry.listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => entry.listeners.delete(listener),
    dispatchEvent: () => false,
  };
}) as typeof window.matchMedia;
window.addEventListener("resize", () => {
  for (const entry of mediaLists) {
    const event = { matches: window.innerWidth <= 767, media: entry.query } as MediaQueryListEvent;
    for (const listener of entry.listeners) listener(event);
  }
});
