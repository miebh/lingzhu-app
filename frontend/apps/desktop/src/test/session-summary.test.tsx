import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SessionSummaryMenu } from "@/components/SessionSummaryMenu";
import { SESSION_SUMMARY_EVENT } from "@/lib/keybinds";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => import("./support/api-mock"));

describe("session summary", () => {
  test("summarizes MCP, plugins and skills", async () => {
    vi.mocked(api.mcpStatus).mockResolvedValue([
      { name: "a", status: "connected", tools: [], resources: [] },
      { name: "b", status: "needs_auth", tools: [], resources: [] },
    ]);
    vi.mocked(api.plugins).mockResolvedValue([
      {
        name: "plugin",
        capabilities: { tools: false, commands: false, permissions: false, hooks: false },
        tools: [],
        commands: [],
        panels: [],
      },
    ]);
    vi.mocked(api.skills).mockResolvedValue([{ id: "skill", name: "Skill" }]);
    vi.mocked(api.skillErrors).mockResolvedValue([{ url: "https://example.com", error: "failed" }]);

    const onOpenMCP = vi.fn();
    const onOpenExtensions = vi.fn();
    const onOpenSkill = vi.fn();
    const onCreateSkill = vi.fn();
    const onSetupSkill = vi.fn();
    render(
      <SessionSummaryMenu
        workspace="/w"
        onOpenMCP={onOpenMCP}
        onOpenExtensions={onOpenExtensions}
        onOpenSkill={onOpenSkill}
        onCreateSkill={onCreateSkill}
        onSetupSkill={onSetupSkill}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    expect(await screen.findByText("MCP")).toBeTruthy();

    const mcpRow = screen.getByText("MCP").closest('[role="menuitem"]');
    const pluginRow = screen.getByText("Plugins").closest('[role="menuitem"]');
    const skillRow = screen.getByText("Skills").closest('[role="menuitem"]');
    expect(mcpRow).toBeTruthy();
    expect(pluginRow).toBeTruthy();
    expect(skillRow).toBeTruthy();
    expect(within(mcpRow as HTMLElement).getByText("1/2")).toBeTruthy();
    expect(within(pluginRow as HTMLElement).getByText("1")).toBeTruthy();
    expect(within(skillRow as HTMLElement).getByText("1")).toBeTruthy();

    await userEvent.click(screen.getByText("MCP"));
    expect(await screen.findByText("a")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
    await userEvent.click(screen.getByText("a"));
    expect(onOpenMCP).toHaveBeenCalledTimes(1);
    expect(onOpenExtensions).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.click(await screen.findByText("Skills"));
    await userEvent.click(await screen.findByText("Skill"));
    expect(onOpenSkill).toHaveBeenCalledWith("skill");

    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.click(await screen.findByText("Skills"));
    await userEvent.click(await screen.findByText("New skill"));
    expect(onCreateSkill).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.click(await screen.findByText("Skills"));
    await userEvent.click(await screen.findByText("Set up with AI"));
    expect(onSetupSkill).toHaveBeenCalledTimes(1);
  });

  test("opens the mobile summary as a drawer", async () => {
    vi.mocked(api.mcpStatus).mockResolvedValue([
      { name: "a", status: "connected", tools: [], resources: [] },
    ]);
    vi.mocked(api.plugins).mockResolvedValue([]);
    vi.mocked(api.skills).mockResolvedValue([]);
    vi.mocked(api.skillErrors).mockResolvedValue([]);

    render(<SessionSummaryMenu workspace="/w" mobile />);
    await userEvent.click(screen.getByRole("button", { name: "Session details" }));

    expect(await screen.findByRole("dialog", { name: "Session details" })).toBeTruthy();
    expect(await screen.findByText("a")).toBeTruthy();
  });

  test("opens service submenus on hover", async () => {
    vi.mocked(api.mcpStatus).mockResolvedValue([
      { name: "a", status: "connected", tools: [], resources: [] },
    ]);
    vi.mocked(api.plugins).mockResolvedValue([]);
    vi.mocked(api.skills).mockResolvedValue([]);
    vi.mocked(api.skillErrors).mockResolvedValue([]);

    render(<SessionSummaryMenu workspace="/w" />);
    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.hover(screen.getByText("MCP"));

    expect(await screen.findByText("a")).toBeTruthy();
  });

  test("opens project skill files in the side panel", async () => {
    vi.mocked(api.mcpStatus).mockResolvedValue([]);
    vi.mocked(api.plugins).mockResolvedValue([]);
    vi.mocked(api.skills).mockResolvedValue([
      { id: "project", name: "Project skill", source: "project", path: "/w/.lingzhu/skills/project/SKILL.md" },
    ]);
    vi.mocked(api.skillErrors).mockResolvedValue([]);

    const onOpenSkill = vi.fn();
    const onOpenSkillFile = vi.fn();
    render(
      <SessionSummaryMenu
        workspace="/w"
        onOpenSkill={onOpenSkill}
        onOpenSkillFile={onOpenSkillFile}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.click(await screen.findByText("Skills"));
    await userEvent.click(await screen.findByText("Project skill"));

    expect(onOpenSkillFile).toHaveBeenCalledWith("/w/.lingzhu/skills/project/SKILL.md");
    expect(onOpenSkill).not.toHaveBeenCalled();
  });

  test("toggles a server from the summary", async () => {
    vi.mocked(api.mcpStatus).mockResolvedValue([
      { name: "a", status: "connected", tools: [], resources: [] },
    ]);
    vi.mocked(api.plugins).mockResolvedValue([]);
    vi.mocked(api.skills).mockResolvedValue([]);
    vi.mocked(api.skillErrors).mockResolvedValue([]);

    render(<SessionSummaryMenu workspace="/w" />);
    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.click(await screen.findByText("MCP"));
    await userEvent.click(await screen.findByRole("switch", { name: /a:/ }));

    expect(api.disconnectMCP).toHaveBeenCalledWith("/w", "a");
  });

  test("opens from the session details shortcut", async () => {
    vi.mocked(api.mcpStatus).mockResolvedValue([]);
    vi.mocked(api.plugins).mockResolvedValue([]);
    vi.mocked(api.skills).mockResolvedValue([]);
    vi.mocked(api.skillErrors).mockResolvedValue([]);

    render(<SessionSummaryMenu workspace="/w" />);
    window.dispatchEvent(new Event(SESSION_SUMMARY_EVENT));

    expect(await screen.findByText("MCP")).toBeTruthy();
  });

  test("signs in and opens errors from the MCP submenu", async () => {
    vi.mocked(api.mcpStatus).mockResolvedValue([
      { name: "auth", status: "needs_auth", tools: [], resources: [] },
      { name: "broken", status: "failed", error: "boom", tools: [], resources: [] },
    ]);
    vi.mocked(api.plugins).mockResolvedValue([]);
    vi.mocked(api.skills).mockResolvedValue([]);
    vi.mocked(api.skillErrors).mockResolvedValue([]);

    render(<SessionSummaryMenu workspace="/w" />);
    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.click(await screen.findByText("MCP"));
    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));

    await screen.findByRole("button", { name: "Complete sign-in" });
    expect(api.startMCPAuth).toHaveBeenCalledWith("/w", "auth");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Session details" }));
    await userEvent.click(await screen.findByText("MCP"));
    await userEvent.click(await screen.findByText("broken"));
    expect(await screen.findByText("boom")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(api.reconnectMCP).toHaveBeenCalledWith("/w", "broken");
  });
});
