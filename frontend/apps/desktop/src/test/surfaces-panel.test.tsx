import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { api } from "@/lib/api";
import { useShell } from "@/app/ShellProvider";
import { useUiStore } from "@/store/ui";
import { SessionSidePanel } from "@/components/session/SessionSidePanel";
import type { SidePanelTab } from "@/lib/sidePanel";
import { ReviewFileTree } from "@lingzhu/session-ui/ReviewFileTree";
import { setLanguage } from "@lingzhu/ui/i18n";
import type { ChatState } from "@lingzhu/ui/types";
import { chat } from "./support/chat";

const { api: mockApi } = await vi.hoisted(async () => await import("./support/api-mock"));
vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("side panel surfaces", () => {
  test("panel state is shared across useShell callers", async () => {
    useUiStore.setState({ panelOpen: false });

    function Toggle() {
      const { panel } = useShell();
      return (
        <button type="button" onClick={() => panel.setPanelOpen(true)}>
          open panel
        </button>
      );
    }

    function Reader() {
      const { panel } = useShell();
      return <span>{panel.panelOpen ? "panel-open" : "panel-closed"}</span>;
    }

    render(
      <>
        <Toggle />
        <Reader />
      </>,
    );
    expect(screen.getByText("panel-closed")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "open panel" }));
    expect(screen.getByText("panel-open")).toBeTruthy();
  });

  test("side panel selects and closes Review/Files/Details tabs", async () => {
    const onSelect = vi.fn();
    const onCloseTab = vi.fn();
    const tabs: SidePanelTab[] = [{ id: "review", label: "Review" }];
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={tabs}
        active="review"
        onSelect={onSelect}
        onCloseTab={onCloseTab}
        onClose={() => undefined}
        onSendReview={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: /Review/ }));
    expect(onSelect).toHaveBeenCalledWith("review");
    await userEvent.click(screen.getByRole("button", { name: "Close Review" }));
    expect(onCloseTab).toHaveBeenCalledWith("review");
    // The + menu is always offered, even without an add handler.
    expect(screen.getByRole("button", { name: "Add panel tab" })).toBeTruthy();
  });

  test("review pane sends line comments", async () => {
    vi.mocked(api.sessionDiff).mockResolvedValueOnce({
      base: "",
      head: "",
      diffs: [
        {
          file: "a.ts",
          patch: "@@ -1,1 +1,1 @@\n-old\n+new",
          additions: 1,
          deletions: 1,
          status: "modified",
        },
      ],
    } as never);
    const onSendReview = vi.fn();
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={onSendReview}
      />,
    );
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    await userEvent.click(screen.getByText("new"));
    await userEvent.type(screen.getByLabelText("Review comment"), "Please fix");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    await userEvent.click(screen.getByRole("button", { name: /Send \(1\)/ }));
    expect(onSendReview).toHaveBeenCalledWith(expect.stringContaining("a.ts"), expect.any(Array));
    expect(onSendReview).toHaveBeenCalledWith(expect.stringContaining("Please fix"), expect.any(Array));
  });

  test("a diff line gutter note becomes a ReviewComment with its file and range", async () => {
    vi.mocked(api.sessionDiff).mockResolvedValueOnce({
      base: "",
      head: "",
      diffs: [
        {
          file: "src/app.ts",
          patch: "@@ -10,2 +10,3 @@\n context\n+added line\n context2",
          additions: 1,
          deletions: 1,
          status: "modified",
        },
      ],
    } as never);
    const onSendReview = vi.fn();
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={onSendReview}
      />,
    );

    await waitFor(() => expect(screen.getAllByText(/app\.ts/).length).toBeGreaterThan(0));

    // The gutter control anchors a note to one line without dragging.
    const row = document.querySelector('[data-slot="review-diff-row"][data-kind="add"]')!;
    expect(row.getAttribute("data-line")).toBe("11");
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "Comment on line 11" }));

    const composer = await waitFor(() => {
      const found = document.querySelector('[data-slot="review-line-composer"]');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    expect(composer.getAttribute("data-line")).toBe("11");

    await userEvent.type(within(composer).getByLabelText("Review comment"), "Rename this");
    await userEvent.click(within(composer).getByRole("button", { name: "Add note" }));

    // The saved note renders under its own line.
    const note = await waitFor(() => {
      const found = document.querySelector('[data-slot="review-line-note"]');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    expect(note.getAttribute("data-line")).toBe("11");
    expect(note.textContent).toContain("Rename this");

    await userEvent.click(screen.getByRole("button", { name: /Send \(1\)/ }));
    const [prompt, notes] = onSendReview.mock.calls[0];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ file: "src/app.ts", start: 11, end: 11, side: "new", text: "Rename this" });
    // The composed prompt names the file and the exact line range.
    expect(prompt).toContain("`src/app.ts` L11 (new)");
    expect(prompt).toContain("Rename this");
  });

  test("files pane opens and searches workspace files", async () => {
    vi.mocked(api.files).mockResolvedValueOnce({
      entries: [{ path: "app.ts", name: "app.ts", type: "file", size: 1, modified: "" }],
    } as never);
    const onOpenFile = vi.fn();
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "files", label: "Files" }]}
        active="files"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={() => undefined}
        onOpenFile={onOpenFile}
      />,
    );
    await userEvent.click(await screen.findByText("app.ts"));
    expect(onOpenFile).toHaveBeenCalledWith("app.ts");
    vi.mocked(api.searchFiles).mockResolvedValueOnce({
      files: [{ path: "README.md" }],
      truncated: false,
    } as never);
    await userEvent.type(screen.getByLabelText("Search workspace files"), "readme");
    await userEvent.click(await screen.findByText("README.md"));
    expect(onOpenFile).toHaveBeenCalledWith("README.md");
  });

  test("details pane renders session identity, context and changes", async () => {
    const detailChat = {
      ...chat([]),
      title: "Detail test",
      model: "m",
      provider: "p",
      agent: "build",
      tokens: 100,      usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
    } as ChatState;
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "details", label: "Details" }]}
        active="details"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={() => undefined}
        chat={detailChat}
        contextWindow={8000}
      />,
    );
    expect(screen.getByText("Detail test")).toBeTruthy();
    expect(screen.getByText("p/m")).toBeTruthy();
    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByText("100 / 8,000")).toBeTruthy();
    expect(screen.getByText("Changes")).toBeTruthy();
  });

  test("side panel exposes a plugins pane", async () => {
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "plugins", label: "Plugins" }]}
        active="plugins"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("demo-plugin")).toBeTruthy());
    expect(screen.getByTitle("Demo panel")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "run" }));
    await userEvent.click(screen.getByRole("button", { name: "Run tool" }));
    await waitFor(() => expect(screen.getByText(/plugin-ok/)).toBeTruthy());
  });

  test("side panel switches Review · Files · Details with live API data", async () => {
    vi.mocked(api.sessionDiff).mockResolvedValue({
      base: "",
      head: "",
      diffs: [
        { file: "a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" },
      ],
    } as never);
    vi.mocked(api.files).mockResolvedValue({
      entries: [{ path: "app.ts", name: "app.ts", type: "file", size: 1, modified: "" }],
    } as never);
    const detailChat = {
      ...chat([]),
      title: "Panel session",
      model: "m",
      provider: "p",
      agent: "build",
      tokens: 1,    } as ChatState;

    function Harness() {
      const [active, setActive] = useState<SidePanelTab["id"]>("review");
      return (
        <SessionSidePanel
          open
          workspace="."
          sessionID="s1"
          tabs={[
            { id: "review", label: "Review" },
            { id: "files", label: "Files" },
            { id: "details", label: "Details" },
          ]}
          active={active}
          onSelect={setActive}
          onCloseTab={() => undefined}
          onClose={() => undefined}
          onSendReview={() => undefined}
          chat={detailChat}
        />
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole("tab", { name: /Files/ }));
    await waitFor(() => expect(screen.getByText("app.ts")).toBeTruthy());
    await userEvent.click(screen.getByRole("tab", { name: /Details/ }));
    expect(screen.getByText("Panel session")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: /Review/ }));
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
  });

  test("switching tabs keeps a visited pane mounted instead of reading it again", async () => {
    const diff = vi.mocked(api.sessionDiff).mockResolvedValue({
      base: "",
      head: "",
      diffs: [{ file: "a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }],
    } as never);
    vi.mocked(api.files).mockResolvedValue({
      entries: [{ path: "app.ts", name: "app.ts", type: "file", size: 1, modified: "" }],
    } as never);

    function Harness() {
      const [active, setActive] = useState<SidePanelTab["id"]>("review");
      return (
        <SessionSidePanel
          open
          workspace="."
          sessionID="s1"
          tabs={[
            { id: "review", label: "Review" },
            { id: "files", label: "Files" },
          ]}
          active={active}
          onSelect={setActive}
          onCloseTab={() => undefined}
          onClose={() => undefined}
          onSendReview={() => undefined}
        />
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    expect(diff).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("tab", { name: /Files/ }));
    await waitFor(() => expect(screen.getByText("app.ts")).toBeTruthy());

    // Coming back reuses the mounted Review pane, so the diff is not read again
    // and no loading state flashes.
    await userEvent.click(screen.getByRole("tab", { name: /Review/ }));
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    expect(diff).toHaveBeenCalledTimes(1);
    // The hidden Files view stays in the tree with its listing.
    expect(screen.getByText("app.ts")).toBeTruthy();
  });

  test("the side panel stays mounted while it closes", () => {
    const { rerender } = render(
      <SessionSidePanel
        open
        workspace="/w"
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onReorderTabs={() => undefined}
        onClose={() => undefined}
        onOpenFile={() => undefined}
        onSendReview={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Review and files")).toBeTruthy();

    rerender(
      <SessionSidePanel
        open={false}
        workspace="/w"
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onReorderTabs={() => undefined}
        onClose={() => undefined}
        onOpenFile={() => undefined}
        onSendReview={() => undefined}
      />,
    );
    const panel = screen.getByLabelText("Review and files");
    expect(panel.getAttribute("data-open")).toBe("false");
    // Its width travels back to zero over the next frames; the chat gets the
    // room once the flight lands, not on the toggle.
    expect(panel.className).toContain("pointer-events-none");
  });

  test("the side panel resizes from its edge handle", () => {
    localStorage.removeItem("lingzhu.sidePanelWidth");
    // The row reports the real width while the wrapper around the pane stays
    // narrow, which is the shape that used to clamp the pane to its minimum.
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const width = Number(this.dataset.testWidth ?? 0);
      return {
        width,
        height: 800,
        top: 0,
        left: 0,
        right: width,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    try {
      render(
        <div data-panel-row data-test-width="1600" style={{ width: 1600 }}>
          <div data-test-width="480" style={{ width: 480 }}>
            <SessionSidePanel
              open
              workspace="/w"
              sessionID="s1"
              tabs={[{ id: "review", label: "Review" }]}
              active="review"
              onSelect={() => undefined}
              onCloseTab={() => undefined}
              onReorderTabs={() => undefined}
              onClose={() => undefined}
              onOpenFile={() => undefined}
              onSendReview={() => undefined}
            />
          </div>
        </div>,
      );
      const panel = screen.getByLabelText("Review and files");
      expect(panel.style.width).toBe("480px");

      // Dragging the left edge inward grows the pane by the pointer delta.
      fireEvent.pointerDown(screen.getByRole("separator", { name: "Resize side panel" }), { clientX: 800 });
      fireEvent.pointerMove(window, { clientX: 700 });
      expect(panel.style.width).toBe("580px");

      // The limit comes from the row, so a far drag stops at the maximum
      // instead of collapsing back to the minimum.
      fireEvent.pointerMove(window, { clientX: -2000 });
      expect(panel.style.width).toBe("800px");
      fireEvent.pointerUp(window);
      expect(localStorage.getItem("lingzhu.sidePanelWidth")).toBe("800");
    } finally {
      rect.mockRestore();
    }
  });

  test("a narrowing row shrinks the side panel instead of the transcript", () => {
    localStorage.removeItem("lingzhu.sidePanelWidth");
    // The row starts at 1600px and narrows to 636px, the width a 900px window
    // leaves after the rail and insets. The panel used to hold its floor there
    // and squeeze the transcript under 400px.
    const widths = { row: 1600 };
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const width = this.dataset.testRow !== undefined ? widths.row : Number(this.dataset.testWidth ?? 0);
      return {
        width,
        height: 800,
        top: 0,
        left: 0,
        right: width,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    try {
      const { rerender } = render(
        <div data-panel-row data-test-row style={{ width: widths.row }}>
          <div data-test-width="400" />
          <SessionSidePanel
            open
            workspace="/w"
            sessionID="s1"
            tabs={[{ id: "review", label: "Review" }]}
            active="review"
            onSelect={() => undefined}
            onCloseTab={() => undefined}
            onReorderTabs={() => undefined}
            onClose={() => undefined}
            onOpenFile={() => undefined}
            onSendReview={() => undefined}
          />
        </div>,
      );
      const panel = screen.getByLabelText("Review and files");
      expect(panel.style.width).toBe("480px");
      expect(panel.getAttribute("data-overlay")).toBeNull();

      widths.row = 636;
      rerender(
        <div data-panel-row data-test-row style={{ width: widths.row }}>
          <div data-test-width="400" />
          <SessionSidePanel
            open
            workspace="/w"
            sessionID="s1"
            tabs={[{ id: "review", label: "Review" }]}
            active="review"
            onSelect={() => undefined}
            onCloseTab={() => undefined}
            onReorderTabs={() => undefined}
            onClose={() => undefined}
            onOpenFile={() => undefined}
            onSendReview={() => undefined}
          />
        </div>,
      );
      // The row's ResizeObserver is stubbed in tests, so the window resize is
      // what re-measures it here; both paths run the same measurement.
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      // Too narrow for both minimums, so the panel floats over the transcript
      // rather than taking the space the transcript needs.
      expect(panel.getAttribute("data-overlay")).toBe("true");
      expect(panel.className).toContain("absolute");
      expect(Number.parseInt(panel.style.width, 10)).toBeLessThanOrEqual(636 - 16);
    } finally {
      rect.mockRestore();
    }
  });

  test("the plus menu adds a view to the one panel", async () => {
    const onAddTab = vi.fn();
    render(
      <SessionSidePanel
        open
        workspace="/w"
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onReorderTabs={() => undefined}
        onClose={() => undefined}
        onOpenFile={() => undefined}
        onSendReview={() => undefined}
        onAddTab={onAddTab}
      />,
    );

    // The menu offers only the views the panel does not show yet, and leaves
    // out Context and Terminal: the header ring and the bottom terminal own them.
    await userEvent.click(screen.getByRole("button", { name: "Add panel tab" }));
    expect(screen.queryByRole("menuitem", { name: "Review" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Context" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Terminal" })).toBeNull();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Plugins" }));
    expect(onAddTab).toHaveBeenCalledWith("plugins");

    // A single strip, no split.
    expect(screen.getAllByRole("tablist", { name: "Panel tabs" })).toHaveLength(1);
  });

  test("side panel cycles Review, Files, Details and Plugins", async () => {
    vi.mocked(api.sessionDiff).mockResolvedValue({
      base: "",
      head: "",
      diffs: [{ file: "a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }],
    } as never);
    vi.mocked(api.files).mockResolvedValue({
      entries: [{ path: "app.ts", name: "app.ts", type: "file", size: 1, modified: "" }],
    } as never);

    function Harness() {
      const [active, setActive] = useState<SidePanelTab["id"]>("review");
      return (
        <SessionSidePanel
          open
          workspace="."
          sessionID="s1"
          tabs={[
            { id: "review", label: "Review" },
            { id: "files", label: "Files" },
            { id: "details", label: "Details" },
            { id: "plugins", label: "Plugins" },
          ]}
          active={active}
          onSelect={setActive}
          onCloseTab={() => undefined}
          onClose={() => undefined}
          onSendReview={() => undefined}
          chat={chat([])}
        />
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole("tab", { name: /Files/ }));
    await waitFor(() => expect(screen.getByText("app.ts")).toBeTruthy());
    await userEvent.click(screen.getByRole("tab", { name: /Details/ }));
    expect(screen.getAllByText("Session").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: /Plugins/ }));
    await waitFor(() => expect(screen.getByText("demo-plugin")).toBeTruthy());
  });

  test("details pane localizes to Chinese", async () => {
    setLanguage("zh");
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "details", label: "Details" }]}
        active="details"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={() => undefined}
        chat={chat([])}
      />,
    );
    expect(screen.getAllByText("会话").length).toBeGreaterThan(0);
    expect(screen.getByText("上下文")).toBeTruthy();
    expect(screen.getByText("改动")).toBeTruthy();
    setLanguage("en");
  });

  test("review toolbar exposes both icon segmented groups", async () => {
    vi.mocked(api.sessionDiff).mockResolvedValue({
      base: "",
      head: "",
      diffs: [{ file: "a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }],
    } as never);
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={() => undefined}
        chat={chat([])}
      />,
    );
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    expect(screen.getByRole("radiogroup", { name: "Expand mode" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Diff layout" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Show all lines" }).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(screen.getByRole("radio", { name: "Hide non-diff lines" }));
    expect(screen.getByRole("radio", { name: "Hide non-diff lines" }).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(screen.getByRole("radio", { name: "Split diff" }));
    expect(screen.getByRole("radio", { name: "Split diff" }).getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("old")).toBeTruthy();
    expect(await screen.findByText("new")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Filter files"), "zzz");
    expect(await screen.findByText("No files match.")).toBeTruthy();
  });

  test("review file tree lists changed paths depth-first", async () => {
    const onSelect = vi.fn();
    render(
      <ReviewFileTree
        files={[
          { file: "src/app.ts", additions: 1, deletions: 0, status: "modified", patch: "" },
          { file: "src/lib/util.ts", additions: 2, deletions: 1, status: "added", patch: "" },
          { file: "README.md", additions: 0, deletions: 3, status: "deleted", patch: "" },
        ]}
        selected="src/app.ts"
        onSelect={onSelect}
      />,
    );
    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("src/lib/util.ts");
    expect(rows[1].textContent).toContain("src/app.ts");
    expect(rows[2].textContent).toContain("README.md");
    await userEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith("src/app.ts");
  });

  test("review file tree can be hidden from the toolbar", async () => {
    vi.mocked(api.sessionDiff).mockResolvedValue({
      base: "",
      head: "",
      diffs: [{ file: "src/a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }],
    } as never);
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={() => undefined}
        chat={chat([])}
      />,
    );
    await waitFor(() => expect(screen.getAllByText(/a\.ts/).length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole("button", { name: "Hide file tree" }));
    expect(screen.getByRole("button", { name: "Show file tree" })).toBeTruthy();
  });

  test("review preview opens the current file in the panel", async () => {
    vi.mocked(api.sessionDiff).mockResolvedValue({
      base: "",
      head: "",
      diffs: [{ file: "src/a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }],
    } as never);
    const onOpenFile = vi.fn();
    render(
      <SessionSidePanel
        open
        workspace="."
        sessionID="s1"
        tabs={[{ id: "review", label: "Review" }]}
        active="review"
        onSelect={() => undefined}
        onCloseTab={() => undefined}
        onClose={() => undefined}
        onSendReview={() => undefined}
        onOpenFile={onOpenFile}
        chat={chat([])}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Open .* in panel/ })).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /Open .* in panel/ }));
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts");
  });
});
