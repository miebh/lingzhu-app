/**
 * The line beside nested content. Its ends follow what the content shows: the
 * top of its first text, or of a card, down to the bottom of its last. Rows pad
 * their text differently, so a fixed inset would fall short on one side and run
 * long on the other.
 */
const contents =
  '[data-component="collapsible"].tool-collapsible:not([data-rail="false"]) > [data-slot="collapsible-content"]';

// Cards count by their edges: their text can be cut off inside them, or drawn
// where a tree walk does not reach.
const cards = '[data-component="bash-output"], [data-slot="accordion-item"], [data-component="task-tool-card"]';

// The strip left of nested content, as wide as the content's indent.
const strip = 14;

/**
 * Measures every nested content block under `root` and sets `--rail-top` and
 * `--rail-bottom`, so the rail starts and ends at real ink instead of a fixed
 * inset. Hovering the strip highlights that rail and clicks its trigger.
 *
 * The returned tracker exposes `schedule()` so the caller can request a
 * re-measure without tearing down the observers and listeners it already owns.
 */
export function trackNestedRails(root: HTMLElement) {
  let frame: number | undefined;

  const measure = () => {
    frame = undefined;
    // One visibility cache per pass: the ancestor walk runs `getComputedStyle`
    // on every level, so a shared map turns it into one lookup per element
    // instead of one per text node.
    const visible = new Map<Element, boolean>();
    root.querySelectorAll<HTMLElement>(contents).forEach((content) => {
      if (!content.offsetHeight) return;
      const ink = inkBounds(content, visible);
      if (!ink) return;
      const box = content.getBoundingClientRect();
      // Writing an unchanged custom property still invalidates style, so the
      // value is compared first; a resize that changes nothing does no work.
      const top = `${Math.max(0, ink.top - box.top)}px`;
      const bottom = `${Math.max(0, box.bottom - ink.bottom)}px`;
      if (content.style.getPropertyValue("--rail-top") !== top) {
        content.style.setProperty("--rail-top", top);
      }
      if (content.style.getPropertyValue("--rail-bottom") !== bottom) {
        content.style.setProperty("--rail-bottom", bottom);
      }
    });
  };

  const schedule = () => {
    frame ??= requestAnimationFrame(measure);
  };

  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  observer?.observe(root);
  schedule();

  const target = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches(contents)) return;
    const content = event.target;
    const box = content.getBoundingClientRect();
    const top = box.top + (Number.parseFloat(content.style.getPropertyValue("--rail-top")) || 0);
    const bottom = box.bottom - (Number.parseFloat(content.style.getPropertyValue("--rail-bottom")) || 0);
    if (event.clientX - box.left > strip || event.clientY < top || event.clientY > bottom) return;
    return content;
  };

  let hovered: HTMLElement | undefined;

  const hover = (event: MouseEvent) => {
    const content = target(event);
    if (content === hovered) return;
    hovered?.removeAttribute("data-rail-hover");
    content?.setAttribute("data-rail-hover", "");
    hovered = content;
  };

  const leave = () => {
    hovered?.removeAttribute("data-rail-hover");
    hovered = undefined;
  };

  const click = (event: MouseEvent) => {
    const content = target(event);
    if (!content) return;
    const trigger = content.parentElement?.querySelector<HTMLElement>(':scope > [data-slot="collapsible-trigger"]');
    if (!trigger) return;
    event.preventDefault();
    trigger.click();
  };

  root.addEventListener("pointermove", hover);
  root.addEventListener("pointerleave", leave);
  root.addEventListener("click", click);

  return {
    /** Re-measures on the next frame, coalescing repeated requests. */
    schedule,
    dispose: () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer?.disconnect();
      root.removeEventListener("pointermove", hover);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("click", click);
    },
  };
}

function inkBounds(content: HTMLElement, visible: Map<Element, boolean>) {
  const bounds = { top: Infinity, bottom: -Infinity };

  const add = (rect: DOMRect) => {
    if (!rect.height) return;
    bounds.top = Math.min(bounds.top, rect.top);
    bounds.bottom = Math.max(bounds.bottom, rect.bottom);
  };

  content.querySelectorAll<HTMLElement>(cards).forEach((card) => add(card.getBoundingClientRect()));

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || parent.closest(cards) || !shown(parent, content, visible)) continue;
    range.selectNodeContents(node);
    Array.from(range.getClientRects()).forEach(add);
  }

  return Number.isFinite(bounds.top) ? bounds : undefined;
}

// Text that is laid out but not seen, such as a shimmer's stacked copies or
// actions that show on hover, does not count.
function shown(element: HTMLElement, root: HTMLElement, cache: Map<Element, boolean>) {
  const visited: HTMLElement[] = [];
  let result = true;
  for (let current: HTMLElement | null = element; current && current !== root; current = current.parentElement) {
    const cached = cache.get(current);
    if (cached !== undefined) {
      result = cached;
      break;
    }
    visited.push(current);
    const style = getComputedStyle(current);
    if (style.visibility === "hidden" || Number.parseFloat(style.opacity) < 0.05) {
      result = false;
      break;
    }
  }
  for (const node of visited) cache.set(node, result);
  return result;
}
