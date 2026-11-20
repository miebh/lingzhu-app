import { memo } from "react";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SideTabs } from "@lingzhu/app/components/shell/SideTabs";
import { describeElement } from "@lingzhu/devtools/inspector";

// The real nesting: AppShell > ShellLayout > ShellSidebar > SideTabs.
const ShellSidebar = memo(function ShellSidebarView() {
  return (
    <SideTabs
      tabs={[{ key: "k1", sessionID: "s1", label: "Session one", kind: "chat", closable: true }]}
      onSelect={() => {}}
      onClose={() => {}}
      onNew={() => {}}
      onSearch={() => {}}
    />
  );
});

describe("dev inspector on the session rail", () => {
  test("each rail region outlines its own element", () => {
    const { container } = render(<ShellSidebar />);
    const regions: Array<[string, string]> = [
      ["aside", "aside"],
      ["action row", "aside button"],
      ["tab row", ".side-tab"],
      ["tab title", ".side-tab-title"],
      ["tab avatar", ".side-tab-avatar"],
      ["tab close", ".side-tab-close"],
      ["resize handle", ".resize-handle-h"],
      ["tablist", '[role="tablist"]'],
    ];

    for (const [label, selector] of regions) {
      const element = container.querySelector(selector)!;
      const target = describeElement(element)!;
      // A browser element picker highlights the node under the pointer, so the
      // rail must not collapse every row into one whole-aside outline.
      expect(target.host, label).toBe(element);
      expect(target.name, label).toBe("SideTabsView");
    }
  });

  test("the rail reports the element selector and box size", () => {
    const { container } = render(<ShellSidebar />);
    const row = container.querySelector(".side-tab")!;
    const target = describeElement(row)!;

    expect(target.component).toBeUndefined();
    expect(target.chain[0]).toBe("SideTabsView");
  });
});
