/**
 * Development-only component inspector.
 *
 * Holding Alt turns the pointer into a probe: the React component under it is
 * outlined and named, and a click copies that name instead of reaching the app.
 * The desktop entry mounts this module only in a development build, so a
 * release bundle never includes it.
 */

type FiberNode = {
  type?: unknown;
  elementType?: unknown;
  stateNode?: unknown;
  child?: FiberNode | null;
  return?: FiberNode | null;
};

/** What the probe found under the pointer. */
export type InspectTarget = {
  /** The component that owns the element, or its tag name for plain DOM. */
  name: string;
  /** Component names from the hovered leaf outwards, nearest first. */
  chain: string[];
  /** The exact element under the pointer, highlighted as-is. */
  host: Element;
  /** Nearest `data-component`, which names the design-system surface. */
  component?: string;
  /** Nearest `data-slot`, which names the part inside that surface. */
  slot?: string;
};

const FIBER_PREFIX = "__reactFiber$";

/** Names that describe React plumbing rather than a piece of the UI. */
const PLUMBING = new Set([
  "Fragment",
  "StrictMode",
  "Suspense",
  "SuspenseList",
  "Profiler",
  "Provider",
  "Consumer",
  "Memo",
  "ForwardRef",
  "Offscreen",
]);

/** Wrappers that only forward props to the component the reader cares about. */
const WRAPPER = /^(Slot|Primitive|RovingFocus|Collection|DismissableLayer|FocusScope|Popper|Portal|Presence)/;

/** Third-party renderers whose name would hide the app component around them. */
const VENDOR = new Set(["ReactMarkdown", "MarkdownAsync", "RemarkGfm"]);

function isUiComponent(name: string) {
  if (!/^[A-Z]/.test(name) || PLUMBING.has(name) || WRAPPER.test(name) || VENDOR.has(name)) return false;
  return !name.endsWith("Context") && !name.endsWith("Provider");
}

function typeName(type: unknown): string | undefined {
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || undefined;
  }
  if (!type || typeof type !== "object") return undefined;
  const wrapper = type as { displayName?: string; render?: unknown; type?: unknown };
  if (wrapper.displayName) return wrapper.displayName;
  return typeName(wrapper.render) ?? typeName(wrapper.type);
}

function fiberAt(node: Element): FiberNode | undefined {
  for (const key of Object.keys(node)) {
    if (!key.startsWith(FIBER_PREFIX)) continue;
    return (node as unknown as Record<string, FiberNode>)[key];
  }
  return undefined;
}

/** The element above `node`, stepping out of a shadow root to its host. */
function parentOf(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) return root.host;
  return null;
}

/**
 * Nearest element, from `node` outwards, that React actually rendered. Content
 * a library inserts imperatively (a diff renderer's shadow tree, for instance)
 * carries no fiber of its own, so the probe reports the component that mounted
 * its container instead of going silent.
 */
function reactHostOf(node: Element): Element | undefined {
  for (let current: Element | null = node; current; current = parentOf(current)) {
    if (fiberAt(current)) return current;
  }
  return undefined;
}

/** Every component that owns this element, from the nearest one outwards. */
function chainOf(node: Element): string[] {
  const chain: string[] = [];
  const host = reactHostOf(node);
  let fiber: FiberNode | null | undefined = host ? fiberAt(host) : undefined;
  while (fiber) {
    const name = typeName(fiber.type ?? fiber.elementType);
    if (name && isUiComponent(name) && chain[chain.length - 1] !== name) chain.push(name);
    fiber = fiber.return;
  }
  return chain;
}

/**
 * The nearest component that owns this element. A browser element picker names
 * whatever sits under the pointer, so there is no notion of a "more useful"
 * ancestor: the arrow is `ToolArrow`, the label is `TextShimmer`.
 */
function containerOf(node: Element): { fiber: FiberNode; name: string } | undefined {
  const host = reactHostOf(node);
  for (let current: FiberNode | null | undefined = host ? fiberAt(host) : undefined; current; current = current.return) {
    const name = typeName(current.type ?? current.elementType);
    if (name && isUiComponent(name)) return { fiber: current, name };
  }
  return undefined;
}

/** Nearest value of a data attribute on the element or its ancestors. */
function attribute(node: Element | null, name: string): string | undefined {
  let current = node;
  while (current) {
    const value = current.getAttribute(name);
    if (value) return value;
    current = parentOf(current);
  }
  return undefined;
}

/**
 * Resolves what sits under the pointer. Like a browser element picker, the
 * outline covers exactly the hovered element rather than the component's whole
 * region, so a rail row highlights that row instead of the entire rail.
 */
export function describeElement(target: Element): InspectTarget | undefined {
  const container = containerOf(target);
  if (!container) return undefined;

  return {
    name: container.name,
    chain: chainOf(target),
    host: target,
    component: attribute(target, "data-component"),
    slot: attribute(target, "data-slot"),
  };
}

/** What a click copies: the component name. */
export function copyValue(target: InspectTarget): string {
  return target.name;
}

/**
 * A CSS-like selector for one element, the way a browser element picker names
 * it: `div.side-tab[data-kind="chat"]`.
 */
function describeHost(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).slice(0, 3);
  const id = element.id ? `#${element.id}` : "";
  const attributes = ["data-component", "data-slot", "data-kind", "data-state"]
    .map((name) => {
      const value = element.getAttribute(name);
      return value ? `[${name}="${value}"]` : "";
    })
    .join("");
  return `${tag}${id}${classes.map((name) => `.${name}`).join("")}${attributes}`;
}

/** The badge's second line: the element box, as a browser picker reports it. */
function metaOf(target: InspectTarget, rect = target.host.getBoundingClientRect()): string {
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  return `${describeHost(target.host)}  ·  ${size}`;
}

/** Selects the text in a detached field and copies it inside the click gesture. */
function copyInGesture(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;";
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

/**
 * Writes the text while the click gesture is still active. The async clipboard
 * API can reject in the desktop webview, and its rejection arrives after the
 * gesture has ended, so the selection copy runs first and is not a fallback.
 */
function writeClipboard(text: string) {
  if (copyInGesture(text)) return;
  void navigator.clipboard?.writeText(text).catch(() => {});
}

const STYLE = `
.box {
  position: fixed;
  display: none;
  border: 1px solid var(--fg-accent, #6ee7a8);
  border-radius: 4px;
  background: color-mix(in oklch, var(--fg-accent, #6ee7a8) 8%, transparent);
}
.badge {
  position: fixed;
  display: none;
  flex-direction: column;
  gap: 2px;
  max-width: min(420px, calc(100vw - 16px));
  padding: 6px 8px;
  border: 0.5px solid var(--border-strong, rgba(255, 255, 255, 0.2));
  border-radius: 6px;
  background: var(--bg-layer-01, #161616);
  box-shadow: var(--elevation-floating, 0 8px 24px rgba(0, 0, 0, 0.45));
  color: var(--fg-base, #f5f5f5);
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: 12px;
  font-weight: 530;
  line-height: 16px;
  letter-spacing: -0.02px;
}
.badge[data-copied] {
  border-color: var(--fg-accent, #6ee7a8);
}
.title,
.meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  color: var(--fg-faint, rgba(255, 255, 255, 0.5));
  font-weight: 440;
}
`;

/** Arms the inspector and returns its teardown. */
export function mountInspector(): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};

  const host = document.createElement("div");
  host.setAttribute("data-lz-inspector-host", "");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;

  const box = document.createElement("div");
  box.className = "box";

  const badge = document.createElement("div");
  badge.className = "badge";
  const title = document.createElement("span");
  title.className = "title";
  const meta = document.createElement("span");
  meta.className = "meta";
  badge.append(title, meta);

  shadow.append(style, box, badge);
  document.body.append(host);

  const cursor = document.createElement("style");
  cursor.textContent = "html[data-lz-inspector],html[data-lz-inspector] *{cursor:crosshair!important}";
  document.head.append(cursor);

  let active = false;
  let target: InspectTarget | undefined;
  let x = 0;
  let y = 0;
  let frame = 0;
  let copied = 0;
  /** Until the pointer has moved there is no meaningful element to report. */
  let pointerKnown = false;
  /** The last element described, so hovering still content reuses its fiber walk. */
  let lastElement: Element | null = null;
  let lastTarget: InspectTarget | undefined;
  let paintedTitle = "";
  let paintedMeta = "";
  let paintedBox = "";
  let boxShown = false;
  let badgeShown = false;
  /** Cached badge box, re-measured only when its text changes. */
  const badgeSize = { width: 0, height: 0 };

  const showBadge = (show: boolean) => {
    if (badgeShown === show) return;
    badgeShown = show;
    badge.style.display = show ? "flex" : "none";
  };

  const showBox = (show: boolean) => {
    if (boxShown === show) return;
    boxShown = show;
    box.style.display = show ? "block" : "none";
  };

  /**
   * The element under the pointer; the probe's own host is pointer-transparent.
   * `elementFromPoint` stops at a shadow host, so each shadow root is probed in
   * turn to reach the row that is actually painted there.
   */
  const elementUnderPointer = (): Element | null => {
    if (typeof document.elementFromPoint !== "function") return null;
    try {
      let element = document.elementFromPoint(x, y);
      while (element?.shadowRoot) {
        const inner = element.shadowRoot.elementFromPoint?.(x, y);
        if (!inner || inner === element) break;
        element = inner;
      }
      return element;
    } catch {
      return null;
    }
  };

  const placeBadge = () => {
    badge.style.left = `${Math.max(8, Math.min(x + 16, window.innerWidth - badgeSize.width - 8))}px`;
    badge.style.top = `${Math.max(8, Math.min(y + 18, window.innerHeight - badgeSize.height - 8))}px`;
  };

  /** The badge size only changes when its text does, so it is measured then. */
  const measureBadge = () => {
    badgeSize.width = badge.offsetWidth;
    badgeSize.height = badge.offsetHeight;
  };

  const paint = () => {
    frame = 0;
    if (!active || !pointerKnown) return;
    const element = elementUnderPointer();
    if (!element) {
      target = undefined;
      lastElement = null;
      lastTarget = undefined;
      showBox(false);
      showBadge(false);
      return;
    }

    // Describing an element walks its fiber chain, and the pointer usually sits
    // on the same node for many frames, so the result is reused until it moves.
    if (element !== lastElement) {
      lastElement = element;
      lastTarget = describeElement(element);
    }
    const next = lastTarget;
    if (!next) {
      target = undefined;
      showBox(false);
      showBadge(false);
      return;
    }

    target = next;
    const rect = next.host.getBoundingClientRect();
    const placement = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
    if (paintedBox !== placement) {
      paintedBox = placement;
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }
    showBox(true);

    const line = metaOf(next, rect);
    const renamed = paintedTitle !== next.name || paintedMeta !== line;
    if (paintedTitle !== next.name) {
      title.textContent = next.name;
      paintedTitle = next.name;
    }
    if (paintedMeta !== line) {
      meta.textContent = line;
      paintedMeta = line;
    }
    if (badge.hasAttribute("data-copied")) badge.removeAttribute("data-copied");
    showBadge(true);
    if (renamed) measureBadge();
    placeBadge();
  };

  const schedule = () => {
    if (!active || frame) return;
    frame = window.requestAnimationFrame(paint);
  };

  const activate = () => {
    if (active) return;
    active = true;
    document.documentElement.setAttribute("data-lz-inspector", "");
    paintedTitle = "Inspector";
    paintedMeta = "Move over a component";
    title.textContent = paintedTitle;
    meta.textContent = paintedMeta;
    // The badge waits for the first pointer position instead of parking at 0,0.
    showBadge(pointerKnown);
    showBox(false);
    if (pointerKnown) measureBadge();
    placeBadge();
    schedule();
  };

  const deactivate = () => {
    if (!active) return;
    active = false;
    document.documentElement.removeAttribute("data-lz-inspector");
    window.clearTimeout(copied);
    target = undefined;
    lastElement = null;
    lastTarget = undefined;
    paintedTitle = "";
    paintedMeta = "";
    paintedBox = "";
    showBox(false);
    showBadge(false);
  };

  const move = (event: PointerEvent) => {
    x = event.clientX;
    y = event.clientY;
    pointerKnown = true;
    // Alt may already be down when the window gains the pointer, and a release
    // outside the window sends no keyup, so the modifier is the truth.
    if (event.altKey) activate();
    else if (active) {
      deactivate();
      return;
    }
    schedule();
  };

  const down = (event: PointerEvent) => {
    if (!active) return;
    // The probe owns this click: never let it reach the app under the pointer.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!target) return;

    writeClipboard(copyValue(target));
    paintedMeta = "Copied";
    meta.textContent = paintedMeta;
    measureBadge();
    badge.setAttribute("data-copied", "");
    window.clearTimeout(copied);
    copied = window.setTimeout(() => {
      badge.removeAttribute("data-copied");
      if (!target) return;
      paintedMeta = metaOf(target);
      meta.textContent = paintedMeta;
      measureBadge();
      placeBadge();
    }, 900);
  };

  const swallow = (event: Event) => {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Alt" || event.repeat) return;
    activate();
  };

  const keyup = (event: KeyboardEvent) => {
    if (event.key === "Alt") deactivate();
  };

  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("blur", deactivate);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("click", swallow, true);
  window.addEventListener("auxclick", swallow, true);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule, true);

  return () => {
    window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("keyup", keyup, true);
    window.removeEventListener("blur", deactivate);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("auxclick", swallow, true);
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule, true);
    window.cancelAnimationFrame(frame);
    window.clearTimeout(copied);
    document.documentElement.removeAttribute("data-lz-inspector");
    cursor.remove();
    host.remove();
  };
}
