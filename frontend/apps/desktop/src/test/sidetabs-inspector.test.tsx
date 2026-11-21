import { render } from "./solid-testing";
import { describe, expect, test } from "vitest";
import { SideTabs } from "@lingzhu/app/components/shell/SideTabs";
import { describeElement } from "@lingzhu/devtools/inspector";

// The real nesting: AppShell > ShellLayout > ShellSidebar > SideTabs.
function ShellSidebar() {
  return (
    <SideTabs
      tabs={[{ key: "k1", sessionID: "s1", label: "Session one", kind: "chat", closable: true }]}
      onSelect={() => {}}
      onClose={() => {}}
      onNew={() => {}}
      onSearch={() => {}}
    />
  );
}

describe("dev inspector on the session rail", () => {
  test("each rail region outlines its own element", () => {
    const { container } = render(() => <ShellSidebar />);
    const regions = [
      "aside",
      "aside button",
      ".side-tab",
      ".side-tab-title",
      ".side-tab-avatar",
      ".side-tab-close",
      ".resize-handle-h",
      '[role="tablist"]',
    ];

    for (const selector of regions) {
      const element = container.querySelector(selector)!;
      const target = describeElement(element);
      // A browser element picker highlights the node under the pointer, so the
      // rail must not collapse every row into one whole-aside outline.
      expect(target.host).toBe(element);
      expect(target.name).toBe(target.chain[0]);
      expect(target.name.length).toBeGreaterThan(0);
      // Solid state does not expose component names, so unnamed DOM reports the
      // tag/class fallback rather than a design-system surface.
      expect(target.component).toBeUndefined();
    }
  });

  test("the rail reports the element selector and box size", () => {
    const { container } = render(() => <ShellSidebar />);
    const row = container.querySelector(".side-tab")!;
    const target = describeElement(row);

    expect(target.component).toBeUndefined();
    expect(target.chain[0]).not.toBe("SideTabsView");
    expect(target.chain[0].startsWith("div.side-tab")).toBe(true);
  });
});
