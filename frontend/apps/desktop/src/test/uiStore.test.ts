import { describe, expect, test } from "vitest";
import { DEFAULT_SIDE_PANEL_TAB, isSidePanelTabID } from "@/lib/sidePanel";
import { useUiStore, watchViewport } from "@/store/ui";

describe("ui store panel tabs", () => {
  test("adding a view appends it once and selects it", () => {
    useUiStore.setState({ panelTabs: ["details"], panelTab: "details", panelOpen: false });

    useUiStore.getState().addPanelTab("files");
    expect(useUiStore.getState().panelTabs).toEqual(["details", "files"]);
    expect(useUiStore.getState().panelTab).toBe("files");
    expect(useUiStore.getState().panelOpen).toBe(true);

    // The same view is not added twice.
    useUiStore.getState().addPanelTab("files");
    expect(useUiStore.getState().panelTabs).toEqual(["details", "files"]);
  });

  test("closing the last tab closes the panel", () => {
    useUiStore.setState({ panelTabs: ["files"], panelTab: "files", panelOpen: true });

    useUiStore.getState().closePanelTab("files");
    expect(useUiStore.getState().panelTabs).toEqual(["files"]);
    expect(useUiStore.getState().panelOpen).toBe(false);
  });

  test("closing a tab picks its left neighbour", () => {
    useUiStore.setState({ panelTabs: ["details", "review", "files"], panelTab: "files", panelOpen: true });

    useUiStore.getState().closePanelTab("files");
    expect(useUiStore.getState().panelTabs).toEqual(["details", "review"]);
    expect(useUiStore.getState().panelTab).toBe("review");
  });

  test("a stored view the panel no longer has is dropped", () => {
    // Older builds persisted "context" and "terminal" panes. Restoring them
    // would render a pane that no longer exists, so they are filtered out and
    // the panel falls back to its default view.
    expect(isSidePanelTabID("context")).toBe(false);
    expect(isSidePanelTabID("terminal")).toBe(false);
    expect(isSidePanelTabID("file:")).toBe(false);
    expect(isSidePanelTabID("file:src/app.ts")).toBe(true);
    expect(isSidePanelTabID(DEFAULT_SIDE_PANEL_TAB)).toBe(true);
  });
});

describe("ui store breakpoint", () => {
  test("an unchanged breakpoint keeps the same state object", () => {
    useUiStore.setState({ mobile: false });
    const before = useUiStore.getState();
    useUiStore.getState().setMobile(false);
    // A live window resize fires per frame; minting a new state for the same
    // breakpoint would re-render every shell consumer on every frame.
    expect(useUiStore.getState()).toBe(before);

    useUiStore.getState().setMobile(true);
    expect(useUiStore.getState()).not.toBe(before);
    expect(useUiStore.getState().mobile).toBe(true);
  });

  test("watchViewport only commits a real breakpoint change", () => {
    const width = window.innerWidth;
    useUiStore.setState({ mobile: false });
    const stop = watchViewport();
    const before = useUiStore.getState();
    window.dispatchEvent(new Event("resize"));
    expect(useUiStore.getState()).toBe(before);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    window.dispatchEvent(new Event("resize"));
    expect(useUiStore.getState().mobile).toBe(true);

    stop();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    useUiStore.setState({ mobile: false });
  });
});
