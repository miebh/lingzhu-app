import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { api } from "@/lib/api";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { InboxList } from "@/components/shell/InboxList";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { TopTabs } from "@/components/shell/TopTabs";
import { MobileDrawer } from "@/components/shell/MobileDrawer";
import { SessionHeader } from "@/components/session/SessionHeader";
import { SideTabs } from "@/components/shell/SideTabs";
import { setLanguage } from "@lingzhu/ui/i18n";
import type { PaletteCommand } from "@/lib/palette";
import type { InboxEntry } from "@lingzhu/ui/types";

const { api: mockApi } = await vi.hoisted(async () => await import("./support/api-mock"));
vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("navigation surfaces", () => {
  test("command palette selects with arrows and runs on Enter", async () => {
    const runNew = vi.fn();
    const runReview = vi.fn();
    const onOpenChange = vi.fn();
    const commands: PaletteCommand[] = [
      { id: "new", title: "New session", group: "Commands", run: runNew },
      { id: "review", title: "Review changes", group: "Commands", run: runReview },
    ];
    render(<CommandPalette open commands={commands} onOpenChange={onOpenChange} />);
    const input = await screen.findByLabelText("Command search");
    await userEvent.type(input, "session");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(runNew).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(runReview).not.toHaveBeenCalled();
  });

  test("palette runs the selected second command on Enter", async () => {
    const runReview = vi.fn();
    const commands: PaletteCommand[] = [
      { id: "new", title: "New session", group: "Commands", run: vi.fn() },
      { id: "review", title: "Review changes", group: "Commands", run: runReview },
    ];
    render(<CommandPalette open commands={commands} onOpenChange={() => undefined} />);
    const input = await screen.findByLabelText("Command search");
    await userEvent.type(input, "review");
    await userEvent.keyboard("{Enter}");
    expect(runReview).toHaveBeenCalledTimes(1);
  });

  test("inbox groups sessions and opens one", async () => {
    const onOpen = vi.fn();
    const entries: InboxEntry[] = [
      { key: "n", workspace: ".", sessionID: "n", title: "Needs one", workspaceName: "Project", status: "needs", updated: "2026-01-01" },
      { key: "w", workspace: ".", sessionID: "w", title: "Working one", workspaceName: "Project", status: "working", updated: "2026-01-02" },
      { key: "r", workspace: ".", sessionID: "r", title: "Ready one", workspaceName: "Project", status: "ready", updated: "2026-01-03" },
    ];
    render(<InboxList entries={entries} onOpen={onOpen} />);
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByText("Recent")).toBeTruthy();
    await userEvent.click(screen.getByText("Needs one"));
    expect(onOpen).toHaveBeenCalledWith(entries[0]);
  });

  test("top tabs omit settings and select a chat", async () => {
    const onSelect = vi.fn();
    render(
      <TopTabs
        tabs={[
          { key: "chat", label: "Chat one", kind: "chat", closable: true },
          { key: "settings", label: "Settings", kind: "settings", closable: true },
        ]}
        activeKey="chat"
        onSelect={onSelect}
        onClose={() => undefined}
        onNew={() => undefined}
      />,
    );
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /Chat one/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "chat" }));
  });

  test("mobile drawer switches tabs and closes", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onCloseTab = vi.fn();
    const onSelectWorkspace = vi.fn();
    const onNewForWorkspace = vi.fn();
    const onRenameTab = vi.fn();
    const onForkTab = vi.fn();
    const onDeleteTab = vi.fn();
    const onReopenClosed = vi.fn();
    const onNew = vi.fn();
    const onSearch = vi.fn();
    const onOpenSettings = vi.fn();
    render(
      <MobileDrawer
        tabs={[{ key: "chat", label: "Chat one", subtitle: "Project", kind: "chat", closable: true }]}
        activeKey="chat"
        workspaces={[{ path: ".", name: "Workspace A", addr: "", connected: true, error: "" }]}
        activePath="."
        closedCount={2}
        onReopenClosed={onReopenClosed}
        onSelectWorkspace={onSelectWorkspace}
        onNewForWorkspace={onNewForWorkspace}
        onRenameTab={onRenameTab}
        onForkTab={onForkTab}
        onDeleteTab={onDeleteTab}
        onSelect={onSelect}
        onNew={onNew}
        onSearch={onSearch}
        onOpenSettings={onOpenSettings}
        onCloseTab={onCloseTab}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: /Chat one/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "chat" }));
    await userEvent.click(screen.getByRole("button", { name: "Close Chat one" }));
    expect(onCloseTab).toHaveBeenCalledWith(expect.objectContaining({ key: "chat" }));
    await userEvent.click(screen.getByRole("button", { name: "More actions for Chat one" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename…" }));
    expect(onRenameTab).toHaveBeenCalledWith(expect.objectContaining({ key: "chat" }));
    await userEvent.click(screen.getByRole("button", { name: "Workspace A" }));
    expect(onSelectWorkspace).toHaveBeenCalledWith(".");
    await userEvent.click(screen.getByRole("button", { name: "New session in Workspace A" }));
    expect(onNewForWorkspace).toHaveBeenCalledWith(".");
    await userEvent.click(screen.getByRole("button", { name: /Projects/ }));
    expect(screen.queryAllByRole("button", { name: /Workspace A/ })).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /Projects/ }));
    expect(screen.getByRole("button", { name: "Workspace A" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Recently closed/ }));
    expect(onReopenClosed).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "New session" }));
    expect(onNew).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Search sessions" }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Close sidebar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("vertical rail places project rows above the tab strip", () => {
    render(
      <SideTabs
        tabs={[{ key: "chat", label: "Chat one", kind: "chat", closable: true }]}
        activeKey="chat"
        onSelect={() => undefined}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
      >
        <div>Project rows</div>
      </SideTabs>,
    );
    const projects = screen.getByText("Project rows");
    const list = screen.getByRole("tablist", { name: "Open tabs" });
    expect(projects.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('[role="separator"][aria-hidden="true"]')).toBeTruthy();
  });

  test("a Projects selection owns the only active highlight", () => {
    render(
      <SideTabs
        tabs={[{ key: "chat", label: "Chat one", kind: "chat", closable: true }]}
        activeKey="chat"
        highlightActive={false}
        onSelect={() => undefined}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
      >
        <div>Project rows</div>
      </SideTabs>,
    );
    expect(screen.getByRole("tab", { name: /Chat one/ }).getAttribute("aria-selected")).toBe("false");
  });

  test("deleting a tab dismisses its hover preview", () => {
    vi.useFakeTimers();
    try {
      const tab = { key: "chat", label: "Chat one", kind: "chat" as const, closable: true };
      const props = {
        activeKey: "chat" as string | undefined,
        onSelect: () => undefined,
        onClose: () => undefined,
        onNew: () => undefined,
        onSearch: () => undefined,
        onDeleteTab: () => undefined,
      };
      const { rerender } = render(<SideTabs tabs={[tab]} {...props} />);

      const row = screen.getByRole("tab", { name: /Chat one/ }).closest(".side-tab") as HTMLElement;
      fireEvent.mouseEnter(row);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByRole("tooltip")).toBeTruthy();

      // The context menu covers the row, so opening it drops the preview.
      fireEvent.contextMenu(row);
      expect(screen.queryByRole("tooltip")).toBeNull();

      fireEvent.pointerDown(document.body);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      fireEvent.mouseEnter(row);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByRole("tooltip")).toBeTruthy();

      // Removing the tab clears the preview even without a mouseleave.
      rerender(<SideTabs tabs={[]} {...props} activeKey={undefined} />);
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("side tabs mark a background finish as unread", () => {
    render(
      <SideTabs
        tabs={[{ key: "chat", label: "Chat one", kind: "chat", closable: true, unread: true }]}
        activeKey="other"
        onSelect={() => undefined}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
      />,
    );
    const row = screen.getByRole("tab", { name: /Chat one/ }).closest(".side-tab");
    expect(row?.querySelector(".side-tab-status")).toBeTruthy();
  });

  test("vertical rail hides the empty tab strip under project rows", () => {
    render(
      <SideTabs
        tabs={[]}
        onSelect={() => undefined}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
      >
        <div>Project rows</div>
      </SideTabs>,
    );
    expect(screen.getByText("Project rows")).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "Open tabs" })).toBeNull();
  });

  test("a row being renamed is not a drag source", async () => {
    const onRename = vi.fn();
    render(
      <SideTabs
        tabs={[{ key: "chat", label: "Chat one", kind: "chat", closable: true }]}
        activeKey="chat"
        onSelect={() => undefined}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
        onRename={onRename}
        onReorder={() => undefined}
      />,
    );

    // Double-click starts the rename and swaps the title for a field.
    await userEvent.dblClick(screen.getByRole("tab", { name: /Chat one/ }));
    const field = screen.getByRole("textbox", { name: /Rename Chat one/ });
    expect(field).toBeTruthy();

    // The row must not stay draggable, or a press-drag over the field would
    // start a reorder instead of placing the caret.
    const row = field.closest("[draggable]");
    expect(row?.getAttribute("draggable")).toBe("false");
  });

  test("language preference localizes side tabs", () => {
    setLanguage("zh");
    render(
      <SideTabs
        tabs={[]}
        onSelect={() => undefined}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
      />,
    );
    expect(screen.getByText("首页")).toBeTruthy();
    expect(screen.getByText("搜索会话")).toBeTruthy();
    setLanguage("en");
  });

  test("palette searches workspace files and opens one", async () => {
    vi.mocked(api.searchFiles).mockResolvedValueOnce({
      files: [{ path: "src/app.ts" }],
      truncated: false,
    } as never);
    const onOpenFile = vi.fn();
    render(
      <CommandPalette
        open
        workspace="."
        commands={[]}
        onOpenFile={onOpenFile}
        onOpenChange={() => undefined}
      />,
    );
    await userEvent.type(await screen.findByLabelText("Command search"), "app");
    await userEvent.click(await screen.findByRole("option", { name: /app\.ts/ }));
    expect(onOpenFile).toHaveBeenCalledWith("src/app.ts");
  });

  test("session header project name opens the location card", async () => {
    const onOpenProject = vi.fn();
    const onOpenProjectHome = vi.fn();
    render(
      <SessionHeader
        workspace="lingzhu"
        title="Session one"
        directory="D:\\code\\lingzhu"
        onOpenProjectSettings={onOpenProject}
        onOpenProjectHome={onOpenProjectHome}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "lingzhu" }));
    expect(screen.getByText("Project settings")).toBeTruthy();
    await userEvent.click(screen.getByText("Project settings"));
    expect(onOpenProject).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "lingzhu" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "lingzhu" }));
    expect(onOpenProjectHome).toHaveBeenCalledTimes(1);
  });

  test("top tabs close a chat tab", async () => {
    const onClose = vi.fn();
    render(
      <TopTabs
        tabs={[{ key: "chat", label: "Chat one", kind: "chat", closable: true }]}
        activeKey="chat"
        onSelect={() => undefined}
        onClose={onClose}
        onNew={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close Chat one" }));
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ key: "chat" }));
  });

  test("home dashboard lists projects and opens a session", async () => {
    const onOpenSession = vi.fn();
    const onSelectWorkspace = vi.fn();
    const onOpenWorkspace = vi.fn();
    const onNewSession = vi.fn();
    render(
      <HomeDashboard
        workspaces={[{ path: ".", name: "Project", addr: "", connected: true, error: "" }]}
        activePath="."
        selectedPath="."
        hideProjectName
        rows={[
          {
            key: "k1",
            path: ".",
            sessionID: "s1",
            title: "Recent work",
            workspaceName: "Project",
            updated: new Date().toISOString(),
          },
        ]}
        onOpenSession={onOpenSession}
        onSelectWorkspace={onSelectWorkspace}
        onOpenWorkspace={onOpenWorkspace}
        onNewSession={onNewSession}
      />,
    );
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByLabelText("Search sessions")).toBeTruthy();
    expect(document.querySelector('[data-component="home-session-project-name"]')).toBeNull();
    await userEvent.type(screen.getByLabelText("Search sessions"), "recent");
    expect(screen.getByRole("listbox", { name: "Session search results" })).toBeTruthy();
    await userEvent.click(screen.getByRole("option", { name: /Recent work/ }));
    expect(onOpenSession).toHaveBeenCalledWith(".", "s1");
    const project = screen.getByRole("button", { name: "Project" });
    expect(project.getAttribute("aria-current")).toBe("page");
    await userEvent.click(project);
    expect(onSelectWorkspace).toHaveBeenCalledWith(".");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Project" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "New session" }));
    expect(onNewSession).toHaveBeenCalledWith(".");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Project" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(onOpenWorkspace).toHaveBeenCalledWith(".");
  });

  test("home dashboard localizes to Chinese", async () => {
    setLanguage("zh");
    render(
      <HomeDashboard
        workspaces={[{ path: ".", name: "Project", addr: "", connected: true, error: "" }]}
        activePath="."
        rows={[
          {
            key: "k1",
            path: ".",
            sessionID: "s1",
            title: "Recent work",
            workspaceName: "Project",
            updated: new Date().toISOString(),
          },
        ]}
        onOpenSession={() => undefined}
        onSelectWorkspace={() => undefined}
        onNewSession={() => undefined}
      />,
    );
    expect(screen.getByText("项目")).toBeTruthy();
    expect(screen.getByText("今天")).toBeTruthy();
    const search = screen.getByLabelText("搜索会话");
    await userEvent.type(search, "nothing");
    expect(screen.getByText("没有找到与“nothing”匹配的会话")).toBeTruthy();
    setLanguage("en");
  });

  test("home rows mark sessions already open in a tab", async () => {
    render(
      <HomeDashboard
        workspaces={[{ path: ".", name: "Project", addr: "", connected: true, error: "" }]}
        activePath="."
        rows={[
          {
            key: "k1",
            path: ".",
            sessionID: "s1",
            title: "Open work",
            workspaceName: "Project",
            updated: "2026-01-01T00:00:00.000Z",
          },
        ]}
        openKeys={new Set(["k1"])}
        onOpenSession={() => undefined}
        onSelectWorkspace={() => undefined}
        onNewSession={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Open in a tab")).toBeTruthy();
  });

  test("mobile drawer is a bottom sheet", async () => {
    render(
      <MobileDrawer
        tabs={[{ key: "chat", label: "Chat one", subtitle: "Project", kind: "chat", closable: true }]}
        activeKey="chat"
        onSelect={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
        onOpenSettings={() => undefined}
        onClose={() => undefined}
      />,
    );
    const sheet = screen.getByRole("dialog", { name: "Sessions" });
    expect(sheet.className).toContain("rounded-t-2xl");
    expect(sheet.className).toContain("max-h-[min(75dvh,calc(100dvh-16px))]");
  });

  test("home rows show a running indicator", async () => {
    render(
      <HomeDashboard
        workspaces={[]}
        rows={[
          {
            key: "k1",
            path: ".",
            sessionID: "s1",
            title: "Busy work",
            workspaceName: "Project",
            updated: "2026-01-01T00:00:00.000Z",
            running: true,
          },
        ]}
        onOpenSession={() => undefined}
        onSelectWorkspace={() => undefined}
        onNewSession={() => undefined}
      />,
    );
    expect(document.querySelector("[data-testid='activity-ring'], svg[aria-hidden='true']")).toBeTruthy();
  });

  test("home sessions group under sticky date headers", async () => {
    render(
      <HomeDashboard
        workspaces={[]}
        rows={[
          {
            key: "k1",
            path: ".",
            sessionID: "s1",
            title: "Today work",
            workspaceName: "Project",
            updated: new Date().toISOString(),
          },
          {
            key: "k2",
            path: ".",
            sessionID: "s2",
            title: "Old work",
            workspaceName: "Project",
            updated: "2020-01-01T00:00:00.000Z",
          },
        ]}
        onOpenSession={() => undefined}
        onSelectWorkspace={() => undefined}
        onNewSession={() => undefined}
      />,
    );
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Older")).toBeTruthy();
    expect(screen.getByText("Today work")).toBeTruthy();
    expect(screen.getByText("Old work")).toBeTruthy();
  });

  test("home row context menu runs rename, export and delete", async () => {
    const onRename = vi.fn();
    const onExport = vi.fn();
    const onDelete = vi.fn();
    render(
      <HomeDashboard
        workspaces={[]}
        rows={[
          {
            key: "k1",
            path: ".",
            sessionID: "s1",
            title: "Row work",
            workspaceName: "Project",
            updated: new Date().toISOString(),
          },
        ]}
        onOpenSession={() => undefined}
        onSelectWorkspace={() => undefined}
        onNewSession={() => undefined}
        onRename={onRename}
        onExport={onExport}
        onDelete={onDelete}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Row work").closest("div") as HTMLElement, {
      clientX: 10,
      clientY: 10,
    });
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onRename).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(screen.getByText("Row work").closest("div") as HTMLElement, {
      clientX: 10,
      clientY: 10,
    });
    await userEvent.click(screen.getByRole("menuitem", { name: "Export…" }));
    expect(onExport).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(screen.getByText("Row work").closest("div") as HTMLElement, {
      clientX: 10,
      clientY: 10,
    });
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
