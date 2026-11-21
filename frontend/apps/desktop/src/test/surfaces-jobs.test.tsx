import { render, screen } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { api } from "@/lib/api";
import { SessionActivityChips } from "@/components/session/SessionActivityChips";
import { JobsDialog } from "@/components/dialogs/JobsDialog";
import { TooltipProvider } from "@lingzhu/ui/tooltip";

const { api: mockApi } = await vi.hoisted(async () => await import("./support/api-mock"));
vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("jobs and activity surfaces", () => {
  test("running background jobs open one capsule, then a shell panel with output and stop", async () => {
    const job = {
      id: "j1",
      sessionId: "s1",
      command: "npm run dev",
      file: "",
      status: "running",
      exitCode: -1,
      started: new Date().toISOString(),
      finished: "",
    };
    vi.mocked(api.backgroundJobs).mockResolvedValueOnce([job]);
    vi.mocked(api.jobOutput).mockResolvedValueOnce({
      job: { ...job, exitCode: 0 },
      output: "ready in 120ms\nlistening on 5173\n",
      running: true,
    });
    vi.mocked(api.cancelJob).mockResolvedValueOnce({
      ...job,
      status: "cancelled",
      finished: new Date().toISOString(),
    });

    render(
      () => <TooltipProvider>
        <SessionActivityChips workspace="/w" sessionID="s1" onOpenSubagent={() => undefined} />
      </TooltipProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "1 shell" }));
    await userEvent.click(await screen.findByText("npm run dev"));
    expect(await screen.findByText(/listening on 5173/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(api.cancelJob).toHaveBeenCalledWith("/w", "s1", "j1");
  });

  test("background jobs dialog lists running jobs first and cancels in place", async () => {
    const started = new Date(Date.now() - 120_000).toISOString();
    const finished = new Date(Date.now() - 60_000).toISOString();
    vi.mocked(api.backgroundJobs).mockResolvedValueOnce([
      {
        id: "j2",
        sessionId: "s1",
        command: "npm test",
        file: "/w/job_2.log",
        status: "completed",
        exitCode: 0,
        started,
        finished,
      },
      {
        id: "j1",
        sessionId: "s1",
        command: "npm run dev",
        file: "/w/job_1.log",
        status: "running",
        exitCode: -1,
        started,
        finished: "",
      },
    ]);
    vi.mocked(api.cancelJob).mockResolvedValueOnce({
      id: "j1",
      sessionId: "s1",
      command: "npm run dev",
      file: "/w/job_1.log",
      status: "cancelled",
      exitCode: -1,
      started,
      finished,
    });

    render(
      () => <JobsDialog open workspace="/w" sessionID="s1" title="Session one" onOpenChange={() => undefined} />,
    );

    const commands = await screen.findAllByText(/^npm (run dev|test)$/);
    expect(commands.map((item) => item.textContent)).toEqual(["npm run dev", "npm test"]);
    expect(screen.getByText("exit 0")).toBeTruthy();
    expect(screen.getByText("job_1.log")).toBeTruthy();

    await userEvent.click(screen.getByLabelText("Cancel npm run dev"));
    expect(api.cancelJob).toHaveBeenCalledWith("/w", "s1", "j1");
  });

  test("running subagents share the activity capsule and open their session", async () => {
    vi.mocked(api.sessionSubagents).mockResolvedValueOnce([
      {
        id: "sub_1",
        title: "[subagent] inspect tests",
        agent: "general",
        started: new Date().toISOString(),
      },
    ]);
    const onOpenSubagent = vi.fn();
    render(
      () => <TooltipProvider>
        <SessionActivityChips
          workspace="/w"
          sessionID="s1"
          onOpenSubagent={onOpenSubagent}
        />
      </TooltipProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "1 subagent" }));
    await userEvent.click(await screen.findByText("inspect tests"));
    expect(onOpenSubagent).toHaveBeenCalledWith("sub_1");
    await userEvent.click(screen.getByRole("button", { name: "1 subagent" }));
    await userEvent.click(await screen.findByLabelText("Stop"));
    expect(api.interrupt).toHaveBeenCalledWith("/w", "sub_1");
  });
});
