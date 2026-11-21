/**
 * Development-only element inspector.
 *
 * Holding Alt turns the pointer into a probe: the element under it is outlined,
 * named from its `data-component` / `data-slot` attributes (or its tag, classes
 * and id), and its unique selector is shown. A click copies an executable
 * locator for that exact element instead of the component name, including any
 * shadow-root hops. The desktop entry mounts this module only in a development
 * build, so a release bundle never includes it.
 */

/** What the probe found under the pointer. */
export type InspectTarget = {
  /** Nearest `data-component` / `data-slot` name, or a selector fallback. */
  name: string;
  /** Named surfaces from the hovered leaf outwards, nearest first. */
  chain: string[];
  /** The exact element under the pointer, highlighted as-is. */
  host: Element;
  /** Nearest `data-component`, which names the design-system surface. */
  component?: string;
  /** Nearest `data-slot`, which names the part inside that surface. */
  slot?: string;
  /** Unique CSS selector inside the element's document or shadow root. */
  selector: string;
  /** Executable expression that resolves to this exact element. */
  locator: string;
  /** Short text preview, useful when the selector is not distinctive. */
  text?: string;
};

/**
 * Attributes that name a surface or one of its parts, most specific first: a
 * slot names the part inside a component, so it wins when both sit together.
 */
const NAME_ATTRIBUTES = ["data-slot", "data-component"] as const;

/** The element above `node`, stepping out of a shadow root to its host. */
function parentOf(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) return root.host;
  return null;
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

/** The name this element carries itself, most specific attribute first. */
function ownName(node: Element): string | undefined {
  for (const name of NAME_ATTRIBUTES) {
    const value = node.getAttribute(name);
    if (value) return value;
  }
  return undefined;
}

/** Every named surface that owns this element, from the nearest one outwards. */
function chainOf(node: Element): string[] {
  const chain: string[] = [];
  for (let current: Element | null = node; current; current = parentOf(current)) {
    const name = ownName(current);
    if (name && chain[chain.length - 1] !== name) chain.push(name);
  }
  return chain;
}

/**
 * A CSS-like name for an unnamed element, the way a browser element picker
 * names it: `div.side-tab#rail`.
 */
function fallbackName(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList)
    .slice(0, 3)
    .map((name) => `.${name}`)
    .join("");
  return `${tag}${id}${classes}`;
}

/** Attributes that make a selector stable across re-renders and data changes. */
const SELECTOR_ATTRIBUTES = ["data-component", "data-slot", "data-action", "data-kind", "data-state"] as const;

/** CSS identifier escaping without requiring `CSS.escape` in older webviews. */
function escapeIdent(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/([^A-Za-z0-9_-])/g, "\\$1");
}

/** Attribute values are quoted, so only backslash and quote need escaping. */
function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Classes that still describe the element rather than one visual state. */
function stableClasses(element: Element): string[] {
  return Array.from(element.classList)
    .filter((name) => !name.includes(":") && !name.includes("/") && !name.includes("["))
    .slice(0, 3);
}

/**
 * One selector segment. Data attributes identify a design-system surface; an
 * id is unique by definition; classes and the tag are the fallback for plain
 * DOM. `:nth-child` is only added when the same segment has siblings.
 */
function selectorSegment(element: Element): string {
  if (element.id) return `#${escapeIdent(element.id)}`;

  const tag = element.tagName.toLowerCase();
  const attributes = SELECTOR_ATTRIBUTES.filter((name) => element.hasAttribute(name))
    .map((name) => `[${name}="${escapeAttribute(element.getAttribute(name) ?? "")}"]`)
    .join("");
  const classes = attributes
    ? ""
    : stableClasses(element)
        .map((name) => `.${escapeIdent(name)}`)
        .join("");
  const base = `${tag}${attributes}${classes}`;

  const parent = element.parentElement;
  if (!parent) return base;
  const siblings = Array.from(parent.children);
  const matches = siblings.filter((sibling) => {
    try {
      return sibling.matches(base);
    } catch {
      return false;
    }
  });
  if (matches.length <= 1) return base;
  return `${base}:nth-child(${siblings.indexOf(element) + 1})`;
}

/** A selector that resolves to `element` inside one document or shadow root. */
function selectorWithin(root: ParentNode, element: Element): string {
  if (element === (root as unknown as Element)) return ":scope";
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== (root as unknown as Element)) {
    parts.unshift(selectorSegment(node));
    const selector = parts.join(" > ");
    try {
      if (root.querySelector(selector) === element) return selector;
    } catch {
      // A malformed escaped class should not stop the rest of the path.
    }
    node = node.parentElement;
  }
  return parts.join(" > ");
}

/**
 * An executable expression for the exact element, crossing shadow boundaries.
 * Shadow roots cannot be represented by a plain CSS selector, so this is the
 * reliable form to paste into the inspector console.
 */
function locatorFor(element: Element): string {
  const selectors: string[] = [];
  let node: Element | null = element;
  while (node) {
    const root = node.getRootNode();
    selectors.unshift(selectorWithin(root as ParentNode, node));
    if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
      node = root.host;
      continue;
    }
    break;
  }

  let expression = "document";
  selectors.forEach((selector, index) => {
    expression +=
      index === 0
        ? `.querySelector(${JSON.stringify(selector)})`
        : `?.shadowRoot?.querySelector(${JSON.stringify(selector)})`;
  });
  return expression;
}

/** A short text preview so identical buttons can still be told apart. */
function textOf(element: Element): string | undefined {
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 120) : undefined;
}

/**
 * Resolves what sits under the pointer. Like a browser element picker, the
 * outline covers exactly the hovered element rather than the component's whole
 * region, so a rail row highlights that row instead of the entire rail.
 */
export function describeElement(target: Element): InspectTarget {
  const chain = chainOf(target);
  const name = chain[0] ?? fallbackName(target);
  return {
    name,
    chain: chain.length ? chain : [name],
    host: target,
    component: attribute(target, "data-component"),
    slot: attribute(target, "data-slot"),
    selector: selectorWithin(target.getRootNode() as ParentNode, target),
    locator: locatorFor(target),
    text: textOf(target),
  };
}

/** What a click copies: an expression that resolves to the exact element. */
export function copyValue(target: InspectTarget): string {
  return target.locator;
}

/** The badge's second line: the unique selector and the element box. */
function metaOf(target: InspectTarget, rect = target.host.getBoundingClientRect()): string {
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  return `${target.selector}  ·  ${size}`;
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
  const context = document.createElement("span");
  context.className = "meta";
  badge.append(title, meta, context);

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
  /** The last element described, so hovering still content reuses its lookup. */
  let lastElement: Element | null = null;
  let lastTarget: InspectTarget | undefined;
  let paintedTitle = "";
  let paintedMeta = "";
  let paintedContext = "";
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

    // Describing an element walks its named ancestors, and the pointer usually
    // sits on the same node for many frames, so the result is reused until it
    // moves.
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
    badge.title = next.locator;
    const contextLine = next.chain.length > 1 ? next.chain.join(" › ") : "";
    const renamed =
      paintedTitle !== next.name ||
      paintedMeta !== line ||
      paintedContext !== contextLine;
    if (paintedTitle !== next.name) {
      title.textContent = next.name;
      paintedTitle = next.name;
    }
    if (paintedMeta !== line) {
      meta.textContent = line;
      paintedMeta = line;
    }
    if (paintedContext !== contextLine) {
      context.textContent = contextLine;
      paintedContext = contextLine;
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
    paintedMeta = "Move over an element; click copies its locator";
    paintedContext = "";
    title.textContent = paintedTitle;
    meta.textContent = paintedMeta;
    context.textContent = "";
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
    paintedContext = "";
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
    paintedMeta = "Copied locator";
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
