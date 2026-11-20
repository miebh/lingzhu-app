import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { HomeDashboard } from "@lingzhu/app/components/home/HomeDashboard";

const row = {
  key: "w\u0000s1",
  path: "/w",
  sessionID: "s1",
  title: "检查当前项目进度",
  workspaceName: "bgmfans",
  updated: "2026-01-01",
  group: "today",
};

describe("home session row", () => {
  test("the open-in-tab mark sits outside the avatar, not before the title", () => {
    const { container } = render(
      <HomeDashboard
        workspaces={[{ path: "/w", name: "bgmfans", addr: "", connected: true, error: "" }]}
        rows={[row]}
        openKeys={new Set([row.key])}
        onOpenSession={() => {}}
        onSelectWorkspace={() => {}}
        onOpenWorkspace={() => {}}
        onNewSession={() => {}}
      />,
    );

    const mark = container.querySelector('[aria-label="Open in a tab"]')!;
    expect(mark).toBeTruthy();

    // The mark is positioned against the avatar, so it never reads as a stray
    // "|" between the avatar and the session title.
    const anchor = mark.parentElement!;
    expect(anchor.className).toContain("relative");
    expect((mark as HTMLElement).style.right).toBe("calc(100% + 4px)");
    expect(mark.className).toContain("absolute");

    // The title is a sibling of the avatar wrapper, not of the mark.
    const title = container.querySelector('[data-component="home-session-title"]')!;
    expect(title.closest("span")).not.toBe(anchor);
  });

  test("the project row starts a session without opening the menu", async () => {
    const onNewSession = vi.fn();
    render(
      <HomeDashboard
        workspaces={[{ path: "/w", name: "bgmfans", addr: "", connected: true, error: "" }]}
        rows={[]}
        onOpenSession={() => {}}
        onSelectWorkspace={() => {}}
        onOpenWorkspace={() => {}}
        onNewSession={onNewSession}
      />,
    );

    const row = screen.getByText("bgmfans").closest("[data-home-row]") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "New session" }));

    expect(onNewSession).toHaveBeenCalledWith("/w");
  });

  test("the project menu offers project settings and remove", async () => {
    const onEditWorkspace = vi.fn();
    const onRemoveWorkspace = vi.fn();
    render(
      <HomeDashboard
        workspaces={[{ path: "/w", name: "bgmfans", addr: "", connected: true, error: "" }]}
        rows={[]}
        onOpenSession={() => {}}
        onSelectWorkspace={() => {}}
        onOpenWorkspace={() => {}}
        onEditWorkspace={onEditWorkspace}
        onRemoveWorkspace={onRemoveWorkspace}
        onNewSession={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Actions for bgmfans" }));
    expect(screen.getByRole("menuitem", { name: "Project settings" })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove project" }));

    expect(onRemoveWorkspace).toHaveBeenCalledWith("/w");
    expect(onEditWorkspace).not.toHaveBeenCalled();
  });
});
