import type { JSX } from "solid-js";
import { render, screen } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { copyValue, describeElement } from "@lingzhu/devtools/inspector";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";

function tool(id: string, name: string): TimelineEntry {
  return { key: `t-${id}`, role: "tool", tool: { id, name, arguments: "{}", done: true } };
}

function chat(entries: TimelineEntry[]): ChatState {
  return {
    id: "s1",
    title: "S",
    entries,
    running: false,
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  } as unknown as ChatState;
}

function Panel() {
  return (
    <div data-component="session-panel">
      <span data-slot="session-panel-title">Title</span>
      <button type="button">Action</button>
    </div>
  );
}

function Shell() {
  return (
    <section>
      <Panel />
    </section>
  );
}

function resolve(locator: string): Element | null {
  return Function("document", `return ${locator}`)(document) as Element | null;
}

describe("dev component inspector", () => {
  test("names the closest component that owns the element", () => {
    const { container } = render(() => <Shell />);
    const title = container.querySelector('[data-slot="session-panel-title"]')!;

    expect(describeElement(title)?.name).toBe("session-panel-title");
  });

  test("outlines exactly the hovered element, not the whole component", () => {
    const { container } = render(() => <Shell />);
    const title = container.querySelector('[data-slot="session-panel-title"]')!;

    // A browser element picker highlights the node under the pointer.
    expect(describeElement(title)?.host).toBe(title);
  });

  test("reports the design-system attributes nearest the pointer", () => {
    const { container } = render(() => <Shell />);
    const title = container.querySelector('[data-slot="session-panel-title"]')!;
    const target = describeElement(title)!;

    expect(target.component).toBe("session-panel");
    expect(target.slot).toBe("session-panel-title");
  });

  test("copies a locator for the exact element", () => {
    const { container } = render(() => <Shell />);
    const button = container.querySelector("button")!;
    const target = describeElement(button)!;

    expect(target.selector.length).toBeGreaterThan(0);
    expect(target.locator).toContain("document.querySelector");
    expect(resolve(copyValue(target))).toBe(button);
  });

  test("the locator distinguishes repeated components", () => {
    const { container } = render(
      () => <section>
        <Panel />
        <Panel />
      </section>,
    );
    const buttons = container.querySelectorAll("button");
    const first = describeElement(buttons[0])!;
    const second = describeElement(buttons[1])!;

    expect(first.locator).not.toBe(second.locator);
    expect(resolve(first.locator)).toBe(buttons[0]);
    expect(resolve(second.locator)).toBe(buttons[1]);
  });

  test("ignores plain DOM with no component above it", () => {
    const host = document.createElement("div");
    document.body.append(host);

    expect(describeElement(host)).toMatchObject({ name: "div", chain: ["div"] });
    host.remove();
  });

  test("importing the module does not mount anything", async () => {
    const before = document.body.querySelectorAll("[data-lz-inspector-host]").length;
    await import("@lingzhu/devtools/inspector");
    expect(document.body.querySelectorAll("[data-lz-inspector-host]").length).toBe(before);
  });

  test("mounts a probe only while Alt is held", async () => {
    const { mountInspector } = await import("@lingzhu/devtools/inspector");
    const teardown = mountInspector();
    const host = document.body.querySelector("[data-lz-inspector-host]");
    expect(host).toBeTruthy();

    // The probe host is pointer-transparent so it never becomes the target.
    expect((host as HTMLElement).style.pointerEvents).toBe("none");
    expect(document.documentElement.hasAttribute("data-lz-inspector")).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    expect(document.documentElement.hasAttribute("data-lz-inspector")).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
    expect(document.documentElement.hasAttribute("data-lz-inspector")).toBe(false);

    teardown();
    expect(document.body.querySelector("[data-lz-inspector-host]")).toBeNull();
  });

  test("the badge waits for the first pointer position", async () => {
    const { mountInspector } = await import("@lingzhu/devtools/inspector");
    const teardown = mountInspector();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    const badge = document.body.querySelector("[data-lz-inspector-host]")!.shadowRoot!.querySelector<HTMLElement>(".badge")!;
    // Activating from the keyboard alone would otherwise park the badge at 0,0.
    expect(badge.style.display).not.toBe("flex");

    teardown();
  });

  test("the pointer modifier arms the probe without a keydown", async () => {
    const { container } = render(() => <Shell />);
    const button = container.querySelector("button")!;
    const original = document.elementFromPoint;
    document.elementFromPoint = () => button;

    const { mountInspector } = await import("@lingzhu/devtools/inspector");
    const teardown = mountInspector();

    // A release outside the window sends no keyup, so the pointer is the truth.
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10, altKey: true }));
    expect(document.documentElement.hasAttribute("data-lz-inspector")).toBe(true);

    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10 }));
    expect(document.documentElement.hasAttribute("data-lz-inspector")).toBe(false);

    teardown();
    document.elementFromPoint = original;
  });

  test("an Alt click copies the component name and never reaches the app", async () => {
    const { container } = render(() => <Shell />);
    const button = container.querySelector("button")!;
    const onAppClick = vi.fn();
    button.addEventListener("click", onAppClick);

    const original = document.elementFromPoint;
    document.elementFromPoint = () => button;

    const { mountInspector } = await import("@lingzhu/devtools/inspector");
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => (writes.push(text), Promise.resolve()) },
    });

    const teardown = mountInspector();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10, altKey: true }));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    const down = new PointerEvent("pointerdown", { clientX: 10, clientY: 10, altKey: true, bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(click);

    expect(down.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    expect(onAppClick).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(resolve(writes[0])).toBe(button);

    teardown();
    document.elementFromPoint = original;
  });

  test("a styled leaf is named as itself", () => {
    function Shimmer({ text }: { text: string }) {
      return <span class="tool-shimmer">{text}</span>;
    }

    function ToolRow() {
      return (
        <div data-component="tool-trigger">
          <span data-slot="basic-tool-tool-title">
            <Shimmer text="Used 2 Grep" />
          </span>
        </div>
      );
    }

    const { container } = render(() => <ToolRow />);
    const leaf = container.querySelector(".tool-shimmer")!;
    const target = describeElement(leaf)!;

    // A browser element picker names what is under the pointer.
    expect(target.name).toBe("basic-tool-tool-title");
    expect(target.chain[0]).toBe("basic-tool-tool-title");
    expect(target.host).toBe(leaf);
  });

  test("copying a leaf resolves to the leaf element", () => {
    function Shimmer({ text }: { text: string }) {
      return <span>{text}</span>;
    }

    function ToolRow() {
      return (
        <div>
          <Shimmer text="label" />
        </div>
      );
    }

    const { container } = render(() => <ToolRow />);
    const span = container.querySelector("span")!;
    expect(resolve(copyValue(describeElement(span)!))).toBe(span);
  });

  test("the shared disclosure shell is named as itself", () => {
    function BasicTool({ children }: { children?: JSX.Element }) {
      return <div data-component="collapsible">{children}</div>;
    }

    function ToolBlock() {
      return (
        <BasicTool>
          <span data-slot="basic-tool-tool-title">Used 2 Grep</span>
        </BasicTool>
      );
    }

    const { container } = render(() => <ToolBlock />);
    const title = container.querySelector('[data-slot="basic-tool-tool-title"]')!;
    const target = describeElement(title)!;

    expect(target.name).toBe("basic-tool-tool-title");
    expect(target.host).toBe(title);
  });

  test("content inserted into a shadow root is named by the component that mounted it", () => {
    function DiffHost() {
      return <div data-component="diff-host" />;
    }

    const { container } = render(() => <DiffHost />);
    const host = container.querySelector('[data-component="diff-host"]')!;
    const shadow = host.attachShadow({ mode: "open" });
    const line = document.createElement("span");
    shadow.append(line);

    // A library renders its own DOM here, so the nearest named element is the
    // container it was given.
    const target = describeElement(line)!;
    expect(target.name).toBe("diff-host");
    expect(target.host).toBe(line);
    expect(target.component).toBe("diff-host");
    expect(resolve(target.locator)).toBe(line);
  });

  test("the probe reaches content inside a shadow root", async () => {
    function DiffHost() {
      return <div data-component="diff-host" />;
    }

    const { container } = render(() => <DiffHost />);
    const host = container.querySelector<HTMLElement>('[data-component="diff-host"]')!;
    const shadow = host.attachShadow({ mode: "open" });
    const line = document.createElement("span");
    shadow.append(line);
    Object.defineProperty(shadow, "elementFromPoint", { configurable: true, value: () => line });

    const original = document.elementFromPoint;
    document.elementFromPoint = () => host;

    const { mountInspector } = await import("@lingzhu/devtools/inspector");
    const teardown = mountInspector();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10, altKey: true }));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    const probe = document.body.querySelector("[data-lz-inspector-host]")!.shadowRoot!;
    expect(probe.querySelector(".title")?.textContent).toBe("diff-host");

    teardown();
    document.elementFromPoint = original;
  });

  test("the tool header row names its own components", async () => {
    const { container } = render(
      () => <TooltipProvider>
        <Messages chat={chat([tool("1", "grep"), tool("2", "read")])} detail="compact" />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Used 2 Grep, Read/ }));

    const title = container.querySelector('[data-slot="basic-tool-tool-title"] span')!;
    const target = describeElement(title)!;

    // The label is a shimmering text leaf, so that is what the picker names.
    expect(target.name).toBe("basic-tool-tool-title");
    expect(target.host).toBe(title);
  });

  test("copying a label yields that label's element", () => {
    const { container } = render(
      () => <TooltipProvider>
        <Messages chat={chat([tool("1", "grep"), tool("2", "read")])} detail="compact" />
      </TooltipProvider>,
    );

    const title = container.querySelector('[data-slot="basic-tool-tool-title"] span')!;
    const target = describeElement(title)!;

    expect(target.name).toBe("basic-tool-tool-title");
    expect(resolve(copyValue(target))).toBe(title);
  });

  test("sticky tool headers stop below the session header", () => {
    const { container } = render(
      () => <TooltipProvider>
        <Messages
          chat={chat([tool("1", "grep")])}
          detail="compact"
          header={<div>Session title</div>}
        />
      </TooltipProvider>,
    );

    const scroller = container.querySelector<HTMLElement>(".scroll-stable-both")!;
    // The inset follows the session-header token, so changing the header
    // height does not leave a stale hard-coded value behind.
    expect(scroller.style.getPropertyValue("--sticky-accordion-top")).toBe(
      "var(--session-header-height, 48px)",
    );
  });

  test("a re-render does not schedule another render from the inset", () => {
    const { container, rerender } = render(
      () => <TooltipProvider>
        <Messages chat={chat([tool("1", "grep")])} detail="compact" header={<div>Session title</div>} />
      </TooltipProvider>,
    );

    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    });

    for (let index = 0; index < 5; index += 1) {
      rerender(
        <TooltipProvider>
          <Messages chat={chat([tool("1", "grep")])} detail="compact" header={<div>Session title</div>} />
        </TooltipProvider>,
      );
    }

    spy.mockRestore();
    expect(container.querySelector('[data-component="collapsed-tool-group"]')).toBeTruthy();
    expect(errors).toEqual([]);
  });
});
