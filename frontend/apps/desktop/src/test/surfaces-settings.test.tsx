import { fireEvent, render, screen, waitFor } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "@/lib/api";
import { SettingsNav, type SettingsSearchEntry } from "@/components/settings/SettingsNav";
import { GeneralSection } from "@/components/settings/GeneralSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { ServersSection } from "@/components/settings/ServersSection";
import { ExperimentalSection } from "@/components/settings/ExperimentalSection";
import { ProviderDialog } from "@/components/settings/ProviderDialog";
import { ModelsSection } from "@/components/settings/ModelsSection";
import { ProjectsSection } from "@/components/settings/WorkspacesSection";
import { ShortcutsSection } from "@/components/settings/ShortcutsSection";
import { WorktreesSection } from "@/components/settings/WorktreesSection";
import { defaultPreferences } from "@/lib/preferences";
import { setLanguage } from "@lingzhu/ui/i18n";

const { api: mockApi } = await vi.hoisted(async () => await import("./support/api-mock"));
vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("settings surfaces", () => {
  beforeEach(() => {
    vi.mocked(api.worktrees).mockResolvedValue({ repo: "", worktrees: [] });
    vi.mocked(api.worktreeSessions).mockResolvedValue({});
    vi.mocked(api.worktreeSessionDetails).mockResolvedValue({});
    vi.mocked(api.worktreeInspect).mockResolvedValue({
      active: false,
      dirty: false,
      known: true,
      sessions: [],
    });
    vi.mocked(api.removeWorktree).mockResolvedValue(undefined);
  });

  test("settings search reveals a row with the keyboard", async () => {
    const index: SettingsSearchEntry[] = [
      { key: "general\u0000Color scheme", section: "general", sectionLabel: "General", title: "Color scheme", keywords: "system dark light" },
    ];
    const reveal = vi.fn();
    const change = vi.fn();
    render(
      () => <SettingsNav
        groups={[{ label: "Preferences", items: [{ id: "general", label: "General", icon: () => null }] }]}
        section="general"
        index={index}
        onSectionChange={change}
        onReveal={reveal}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "General" }));
    expect(change).toHaveBeenCalledWith("general");
    await userEvent.type(screen.getByLabelText("Search settings"), "scheme");
    await userEvent.keyboard("{Enter}");
    expect(reveal).toHaveBeenCalledWith(index[0]);
  });

  test("notifications page saves each switch", async () => {
    const save = vi.fn();
    render(
      () => <NotificationsSection
        preferences={{
          preferences: { ...defaultPreferences, notifications: { ...defaultPreferences.notifications } },
          save,
        }}
      />,
    );
    // Completion notices are on by default, so the first click turns it off.
    await userEvent.click(screen.getByRole("switch", { name: "Notify Agent" }));
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0][0].notifications.agent).toBe(false);
  });

  test("models page hides every model in a provider", async () => {
    const save = vi.fn();
    const provider = {
      id: "p",
      name: "Provider",
      baseUrl: "",
      apiKeySet: false,
      apiKeyEnv: "",
      ready: true,
      blacklist: [],
      whitelist: [],
      models: [
        { id: "a", name: "A", contextWindow: 1000 },
        { id: "b", name: "B", contextWindow: 1000 },
      ],
    };
    render(
      () => <ModelsSection
        providers={[provider]}
        preferences={{ ...defaultPreferences, hiddenModels: [] }}
        onSavePreferences={save}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Provider" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Disable all" }));
    expect(save).toHaveBeenCalled();
    const next = save.mock.calls[0][0];
    expect(next.hiddenModels).toEqual([
      { provider: "p", model: "a" },
      { provider: "p", model: "b" },
    ]);
  });

  test("project settings save a name and auto-approve", async () => {
    const save = vi.fn();
    render(
      () => <ProjectsSection
        projects={[{ path: "/w", name: "Project", addr: "", connected: true, error: "" }]}
        onAdd={() => undefined}
        onRemove={() => undefined}
        preferences={{ ...defaultPreferences, projectNames: {}, projectAutoApprove: {} }}
        onSavePreferences={save}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Settings for Project" }));
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    fireEvent.blur(input);
    expect(save.mock.calls.some(([next]) => next.projectNames["/w"] === "Renamed")).toBe(true);
    await userEvent.click(screen.getByRole("switch", { name: "Auto-approve in this project" }));
    expect(save.mock.calls.some(([next]) => next.projectAutoApprove["/w"] === true)).toBe(true);
    const startup = screen.getByLabelText("Worktree startup");
    await userEvent.type(startup, "npm install");
    fireEvent.blur(startup);
    expect(save.mock.calls.some(([next]) => next.projectWorktreeStartup["/w"] === "npm install")).toBe(true);
  });

  test("worktrees list sizes, sessions and delete all", async () => {
    const updated = "2026-11-21T00:00:00Z";
    const linked = Array.from({ length: 5 }, (_, index) => ({
      id: `s${index}`,
      title: `Session ${index + 1}`,
      updated,
    }));
    vi.mocked(api.worktrees).mockResolvedValue({
      repo: "/repo",
      worktrees: [
        { path: "/repo", branch: "main", main: true, managed: false, size: 1024 },
        { path: "/repo-feature", branch: "feature", main: false, managed: true, size: 2048 },
      ],
    });
    vi.mocked(api.worktreeSessionDetails).mockResolvedValue({ "/repo-feature": linked });
    vi.mocked(api.removeWorktree).mockClear();
    render(
      () => <WorktreesSection
        workspaces={[{ path: "/repo", name: "Repo", addr: "", connected: true, error: "" }]}
        sessionCounts={{ "/repo-feature": 3 }}
      />,
    );
    expect(await screen.findByText("2.0 KB")).toBeTruthy();
    expect(screen.getByText("5 sessions")).toBeTruthy();
    expect(screen.getByText("Session 1")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Worktree actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete all worktrees" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete worktrees" }));
    await waitFor(() => expect(api.removeWorktree).toHaveBeenCalledWith("/repo", "/repo-feature", false));
  });

  test("worktrees list one repository once and skip plain folders", async () => {
    const list = {
      repo: "/repo",
      worktrees: [
        { path: "/repo", branch: "main", main: true, managed: false, size: 1024 },
        { path: "/repo-feature", branch: "feature", main: false, managed: true, size: 2048 },
      ],
    };
    vi.mocked(api.worktrees).mockImplementation(async (workspace) => {
      if (workspace === "/plain") throw new Error("worktrees require a git repository");
      return list;
    });
    vi.mocked(api.worktrees).mockClear();
    render(
      () => <WorktreesSection
        workspaces={[
          { path: "/repo", name: "Repo", addr: "", connected: true, error: "" },
          { path: "/repo-feature", name: "Feature", addr: "", connected: true, error: "" },
          { path: "/plain", name: "Plain", addr: "", connected: true, error: "" },
        ]}
      />,
    );
    expect(await screen.findByTitle("/repo-feature")).toBeTruthy();
    expect(screen.getAllByTitle("/repo-feature")).toHaveLength(1);
    expect(screen.queryByText("main")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(api.worktrees).toHaveBeenCalledTimes(2));
  });

  test("worktrees wait until their settings page is active", async () => {
    vi.mocked(api.worktrees).mockClear();
    render(
      () => <WorktreesSection
        active={false}
        workspaces={[{ path: "/repo", name: "Repo", addr: "", connected: true, error: "" }]}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.worktrees).not.toHaveBeenCalled();
  });

  test("worktrees can delete only the ones without sessions", async () => {
    const updated = "2026-11-21T00:00:00Z";
    vi.mocked(api.worktrees).mockResolvedValue({
      repo: "/repo",
      worktrees: [
        { path: "/repo", branch: "main", main: true, managed: false, size: 1024 },
        { path: "/repo-feature", branch: "feature", main: false, managed: true, size: 2048 },
        { path: "/repo-scratch", branch: "scratch", main: false, managed: true, size: 2048 },
      ],
    });
    vi.mocked(api.worktreeSessionDetails).mockResolvedValue({
      "/repo-feature": Array.from({ length: 4 }, (_, index) => ({
        id: `s${index}`,
        title: `Session ${index + 1}`,
        updated,
      })),
      "/repo-scratch": [],
    });
    vi.mocked(api.removeWorktree).mockClear();
    render(
      () => <WorktreesSection
        workspaces={[{ path: "/repo", name: "Repo", addr: "", connected: true, error: "" }]}
      />,
    );
    expect(await screen.findByText("4 sessions")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Worktree actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete worktrees without sessions" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete worktrees" }));
    await waitFor(() => expect(api.removeWorktree).toHaveBeenCalledWith("/repo", "/repo-scratch", false));
    expect(api.removeWorktree).not.toHaveBeenCalledWith("/repo", "/repo-feature", false);
  });

  test("single worktree removal checks the checkout and deletes with force", async () => {
    const updated = "2026-11-21T00:00:00Z";
    vi.mocked(api.worktrees).mockResolvedValue({
      repo: "/repo",
      worktrees: [
        { path: "/repo", branch: "main", main: true, managed: false, size: 1024 },
        { path: "/repo-feature", branch: "feature", main: false, managed: true, size: 2048 },
      ],
    });
    vi.mocked(api.worktreeInspect).mockResolvedValue({
      active: false,
      dirty: true,
      known: true,
      sessions: [{ id: "s1", title: "Feature work", updated }],
    });
    vi.mocked(api.removeWorktree).mockClear();
    render(
      () => <WorktreesSection
        workspaces={[{ path: "/repo", name: "Repo", addr: "", connected: true, error: "" }]}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Remove worktree feature" }));
    expect(await screen.findByText(/Uncommitted changes will be lost/)).toBeTruthy();
    expect(screen.getByText(/Linked sessions will remain/)).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "Delete worktree" }));
    await waitFor(() => expect(api.removeWorktree).toHaveBeenCalledWith("/repo", "/repo-feature", true));
  });

  test("an active worktree cannot be removed", async () => {
    vi.mocked(api.worktrees).mockResolvedValue({
      repo: "/repo",
      worktrees: [
        { path: "/repo", branch: "main", main: true, managed: false, size: 1024 },
        { path: "/repo-feature", branch: "feature", main: false, managed: true, size: 2048 },
      ],
    });
    vi.mocked(api.worktreeInspect).mockResolvedValue({
      active: true,
      dirty: false,
      known: true,
      sessions: [],
    });
    render(
      () => <WorktreesSection
        workspace="/repo-feature"
        workspaces={[{ path: "/repo", name: "Repo", addr: "", connected: true, error: "" }]}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Remove worktree feature" }));
    expect(await screen.findByText(/The active worktree cannot be deleted/)).toBeTruthy();
    const remove = screen.getByRole("button", { name: "Delete worktree" }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
  });

  test("a failed status check offers Retry", async () => {
    vi.mocked(api.worktrees).mockResolvedValue({
      repo: "/repo",
      worktrees: [
        { path: "/repo", branch: "main", main: true, managed: false, size: 1024 },
        { path: "/repo-feature", branch: "feature", main: false, managed: true, size: 2048 },
      ],
    });
    vi.mocked(api.worktreeInspect)
      .mockResolvedValueOnce({ active: false, dirty: false, known: false, error: "git failed", sessions: [] })
      .mockResolvedValueOnce({ active: false, dirty: false, known: true, sessions: [] });
    render(
      () => <WorktreesSection
        workspaces={[{ path: "/repo", name: "Repo", addr: "", connected: true, error: "" }]}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Remove worktree feature" }));
    expect(await screen.findByText("git failed")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Delete worktree" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Delete worktree" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });

  test("servers page lists local core addresses", async () => {
    const onRestart = vi.fn();
    const onRemove = vi.fn();
    render(
      () => <ServersSection
        workspaces={[{ path: ".", name: "Project", addr: "127.0.0.1:8787", connected: true, error: "" }]}
        onRestart={onRestart}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText("http://127.0.0.1:8787")).toBeTruthy();
    expect(screen.getByLabelText("Connected")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Server actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Refresh" }));
    await userEvent.click(await screen.findByRole("button", { name: "Server actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(onRestart).toHaveBeenCalledWith(".");
    expect(onRemove).toHaveBeenCalledWith(".");
  });

  test("experimental page changes sidebar organization", async () => {
    const save = vi.fn();
    render(
      () => <ExperimentalSection
        preferences={{
          preferences: { ...defaultPreferences, appearance: { ...defaultPreferences.appearance } },
          save,
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Organize vertical sidebar" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Projects" }));
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0][0].appearance.sidebarOrganize).toBe("projects");
  });

  test("general color scheme control saves light mode", async () => {
    const save = vi.fn();
    render(
      () => <GeneralSection
        preferences={{
          preferences: { ...defaultPreferences, appearance: { ...defaultPreferences.appearance } },
          save,
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Color scheme" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Light" }));
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0][0].appearance.theme).toBe("light");
  });

  test("general settings localize to Chinese", () => {
    setLanguage("zh");
    render(
      () => <GeneralSection
        preferences={{ preferences: { ...defaultPreferences }, save: vi.fn() }}
      />,
    );
    expect(screen.getByText("常规")).toBeTruthy();
    expect(screen.getByText("配色方案")).toBeTruthy();
    expect(screen.getByText("自动批准工具请求")).toBeTruthy();
    setLanguage("en");
  });

  test("shortcuts page localizes to Chinese", () => {
    setLanguage("zh");
    render(() => <ShortcutsSection preferences={{ preferences: { ...defaultPreferences }, save: vi.fn() }} />);
    expect(screen.getByText("通用")).toBeTruthy();
    expect(screen.getByText("新建会话")).toBeTruthy();
    setLanguage("en");
  });

  test("general language control saves Chinese", async () => {
    const save = vi.fn();
    render(
      () => <GeneralSection
        preferences={{
          preferences: { ...defaultPreferences, appearance: { ...defaultPreferences.appearance } },
          save,
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Language" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "中文" }));
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0][0].appearance.language).toBe("zh");
  });

  test("connect provider dialog uses the reference header and footer inset", async () => {
    render(
      () => <ProviderDialog
        open
        initial={{
          id: "custom",
          name: "Custom",
          baseUrl: "https://api.example.com/v1",
          apiKey: "",
          apiKeySet: false,
          apiKeyEnv: "",
          clearKey: false,
          ready: true,
          models: [],
        }}
        existingIDs={[]}
        presentation="connect"
        onOpenChange={() => undefined}
        onSave={() => undefined}
      />,
    );
    const title = await screen.findByText(/Connect Custom/);
    const header = title.closest("div")?.parentElement as HTMLElement;
    expect(header.className).toContain("px-5");
    expect(header.className).toContain("py-4");
    const footer = screen.getByRole("button", { name: "Connect" }).parentElement as HTMLElement;
    expect(footer.className).toContain("px-5");
    expect(footer.className).toContain("pb-4");
  });

  test("model catalog groups collapse from their header", async () => {
    render(
      () => <ModelsSection
        providers={[
          {
            id: "p",
            name: "Provider",
            baseUrl: "https://api.example.com/v1",
            apiKeySet: true,
            apiKeyEnv: "",
            ready: true,
            blacklist: [],
            whitelist: [],
            models: [{ id: "m", name: "Model A", contextWindow: 1000 }],
          },
        ]}
        preferences={{ ...defaultPreferences, hiddenModels: [] }}
        onSavePreferences={() => undefined}
      />,
    );
    const header = screen.getAllByRole("button", { name: /^Provider$/ })[0];
    expect(header.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });
});
