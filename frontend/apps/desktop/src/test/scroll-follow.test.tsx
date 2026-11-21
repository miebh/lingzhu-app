import { createSignal } from "solid-js";
import { act, render } from "./solid-testing";
import { describe, expect, test } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";

const tool = (id: string): TimelineEntry => ({
  key: `t-${id}`,
  role: "tool",
  tool: { id, name: "grep", arguments: "{}", done: true },
});

function running(entries: TimelineEntry[]): ChatState {
  return {
    id: "s1",
    title: "S",
    entries,
    running: true,
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  } as unknown as ChatState;
}

/** jsdom has no layout, so the scrollport reports fake metrics and records writes. */
function fakeScroller(element: HTMLElement, height: number) {
  const writes: number[] = [];
  let top = height - 400;
  Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => height });
  Object.defineProperty(element, "clientHeight", { configurable: true, get: () => 400 });
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      writes.push(value);
      top = value;
    },
  });
  return {
    writes,
    get top() {
      return top;
    },
    setTop(value: number) {
      top = value;
    },
  };
}

function mount(entries: TimelineEntry[]) {
  const [current, setEntries] = createSignal(entries);
  const view = render(
    () => <TooltipProvider>
      <Messages chat={running(current())} detail="compact" />
    </TooltipProvider>,
  );
  const scroller = view.container.querySelector<HTMLElement>(".scroll-stable-both")!;
  return { ...view, scroller, state: fakeScroller(scroller, 2000), setEntries };
}

const rerenderWith = (view: ReturnType<typeof mount>, entries: TimelineEntry[]) => {
  view.setEntries(entries);
};

describe("streaming follow", () => {
  test("a streamed entry follows the end while the reader has not scrolled", () => {
    const view = mount([tool("1")]);
    view.state.setTop(800);

    act(() => rerenderWith(view, [tool("1"), tool("2")]));

    expect(view.state.top).toBe(2000);
  });

  test("an upward wheel keeps the reader in place when an entry lands before the scroll event", () => {
    const entries = [tool("1"), tool("2")];
    const view = mount(entries);
    view.state.setTop(600);

    // The wheel lands; the scroll event it causes has not been dispatched yet.
    // This is the race that used to drag the reader back to the end.
    act(() => {
      view.scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    });

    const before = view.state.writes.length;
    act(() => rerenderWith(view, [...entries, tool("3")]));

    // The new entry made no scroll write, so the reader stayed where they were.
    expect(view.state.writes.slice(before)).toEqual([]);
    expect(view.state.top).toBe(600);
  });

  test("a downward wheel lets a later entry follow the end again", () => {
    const entries = [tool("1")];
    const view = mount(entries);
    view.state.setTop(400);

    act(() => {
      view.scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    });
    // Scrolling back down to the end reattaches following.
    view.state.setTop(1600);
    act(() => {
      view.scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    act(() => rerenderWith(view, [...entries, tool("2")]));

    expect(view.state.top).toBe(2000);
  });
});
