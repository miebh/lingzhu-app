import { render, screen, waitFor, within } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { NewSessionHome } from "@/components/session/NewSessionHome";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => import("./support/api-mock"));

describe("new session surfaces", () => {
  test("new session surface shows the wordmark, composer and workspace tray", async () => {
    render(
      () => <TooltipProvider>
        <NewSessionHome
          workspaceName="Project"
          workspacePath="."
          workspaces={[{ path: ".", name: "Project", addr: "", connected: true, error: "" }]}
          connected
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onAddWorkspace={() => undefined}
        />
      </TooltipProvider>,
    );
    expect(document.querySelector('[data-slot="wordmark"]')).toBeTruthy();
    expect(screen.getByLabelText("Prompt")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
    expect(screen.getByText(".")).toBeTruthy();
  });

  test("session location trigger opens the location dialog", async () => {
    const onSelectWorkspace = vi.fn();
    const onAddWorkspace = vi.fn();
    render(
      () => <TooltipProvider>
        <NewSessionHome
          workspaceName="Project"
          workspacePath="."
          workspaces={[
            { path: ".", name: "Project", addr: "", connected: true, error: "" },
            { path: "/other", name: "Other", addr: "", connected: true, error: "" },
          ]}
          connected
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onAddWorkspace={onAddWorkspace}
          onSelectWorkspace={onSelectWorkspace}
        />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Session location: Project" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Session location")).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: "Search projects" })).toBeTruthy();
    expect(within(dialog).getByRole("listbox", { name: "Projects" })).toBeTruthy();
    expect(within(dialog).getByText("Current")).toBeTruthy();
    expect(within(dialog).getByText("Add workspace")).toBeTruthy();
    expect(within(dialog).getByText("/other")).toBeTruthy();

    await userEvent.click(within(dialog).getByRole("option", { name: /Other/ }));
    expect(onSelectWorkspace).toHaveBeenCalledWith("/other");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("project search filters the project list", async () => {
    render(
      () => <TooltipProvider>
        <NewSessionHome
          workspaceName="Project"
          workspacePath="."
          workspaces={[
            { path: ".", name: "Project", addr: "", connected: true, error: "" },
            { path: "/other", name: "Other", addr: "", connected: true, error: "" },
          ]}
          connected
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onAddWorkspace={() => undefined}
        />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Session location: Project" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search projects" }), "other");

    expect(within(dialog).queryByRole("option", { name: /Project/ })).toBeNull();
    expect(within(dialog).getByRole("option", { name: /Other/ })).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: /Add workspace/ })).toBeTruthy();
  });

  test("project name and worktree are two independent triggers", async () => {
    const onSelectWorktree = vi.fn();
    const onOpenWorktrees = vi.fn();
    render(
      () => <TooltipProvider>
        <NewSessionHome
          workspaceName="Project"
          workspacePath="."
          workspaces={[{ path: ".", name: "Project", addr: "", connected: true, error: "" }]}
          connected
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onAddWorkspace={() => undefined}
          onSelectWorktree={onSelectWorktree}
          onOpenWorktrees={onOpenWorktrees}
        />
      </TooltipProvider>,
    );

    const project = screen.getByRole("button", { name: "Session location: Project" });
    const worktree = screen.getByRole("button", { name: "Session worktree: Local" });
    expect(project).not.toBe(worktree);

    await userEvent.click(worktree);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Search worktrees" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Run session in" })).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: /Local repository/ })).toBeTruthy();
    expect(within(dialog).getByRole("option", { name: /New worktree/ })).toBeTruthy();

    await userEvent.click(within(dialog).getByRole("option", { name: /New worktree/ }));
    expect(onOpenWorktrees).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSelectWorktree).not.toHaveBeenCalled();
  });

  test("clicking the workspace path opens the file manager", async () => {
    render(
      () => <TooltipProvider>
        <NewSessionHome
          workspaceName="Project"
          workspacePath="."
          workspaces={[{ path: ".", name: "Project", addr: "", connected: true, error: "" }]}
          connected
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onAddWorkspace={() => undefined}
        />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open in File Manager: ." }));
    expect(api.revealPath).toHaveBeenCalledWith(".");
  });

  test("hovering the session location trigger shows the choose-project bubble", async () => {
    render(
      () => <TooltipProvider>
        <NewSessionHome
          workspaceName="Project"
          workspacePath="."
          workspaces={[{ path: ".", name: "Project", addr: "", connected: true, error: "" }]}
          connected
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onAddWorkspace={() => undefined}
        />
      </TooltipProvider>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "Session location: Project" }));
    const bubbles = await screen.findAllByRole("tooltip");
    expect(bubbles.some((bubble) => bubble.textContent === "Choose project")).toBe(true);
  });
});
