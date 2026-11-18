import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    remove: vi.fn(),
    interrupt: vi.fn(),
    sessions: vi.fn(),
    addWorkspaces: vi.fn(),
    workspaces: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspaces";

describe("deleteSession", () => {
  beforeEach(() => {
    vi.mocked(api.remove).mockReset();
    vi.mocked(api.interrupt).mockReset();
    useWorkspaceStore.setState({
      sessionsByWorkspace: {
        "/w": [{ id: "s1", title: "Only", updated: "1" }],
      },
    });
  });

  test("stops a busy run and retries the delete", async () => {
    vi.mocked(api.remove)
      .mockRejectedValueOnce(new Error("agent is running"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(api.interrupt).mockResolvedValue(true);

    await expect(useWorkspaceStore.getState().deleteSession("/w", "s1")).resolves.toBe(true);

    expect(api.interrupt).toHaveBeenCalledWith("/w", "s1");
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(useWorkspaceStore.getState().sessionsByWorkspace["/w"]).toEqual([]);
  });

  test("a plain delete still removes the last session row", async () => {
    vi.mocked(api.remove).mockResolvedValue(undefined);
    vi.mocked(api.interrupt).mockResolvedValue(false);

    await expect(useWorkspaceStore.getState().deleteSession("/w", "s1")).resolves.toBe(true);

    expect(api.interrupt).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().sessionsByWorkspace["/w"]).toEqual([]);
  });
});

describe("connect", () => {
  beforeEach(() => {
    vi.mocked(api.addWorkspaces).mockReset();
    vi.mocked(api.workspaces).mockReset();
    vi.mocked(api.sessions).mockReset();
    vi.mocked(api.sessions).mockResolvedValue([]);
    useWorkspaceStore.setState({
      workspaces: [{ path: "/old", name: "old", addr: "a", connected: true, error: "" }],
      activePath: "/old",
      sessionsByWorkspace: {},
      loadingSessions: {},
    });
  });

  test("adds the picked projects before the reconcile resolves", async () => {
    vi.mocked(api.addWorkspaces).mockResolvedValue([
      { path: "/new", name: "new", addr: "a", connected: true, error: "" },
    ]);
    // The full list is slower than the picker's return; the new row must not
    // wait for it.
    vi.mocked(api.workspaces).mockReturnValue(new Promise(() => undefined));

    void useWorkspaceStore.getState().connect();

    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().workspaces.map((workspace) => workspace.path)).toEqual(["/old", "/new"]);
    });
    expect(useWorkspaceStore.getState().activePath).toBe("/new");
  });
});

describe("prefetchSessions", () => {
  beforeEach(() => {
    vi.mocked(api.sessions).mockReset();
  });

  test("loads only the workspaces that never listed their sessions", async () => {
    vi.mocked(api.sessions).mockResolvedValue([{ id: "s1", title: "Only", updated: "1" }]);
    useWorkspaceStore.setState({
      workspaces: [
        { path: "/loaded", name: "loaded", addr: "a", connected: true, error: "" },
        { path: "/fresh", name: "fresh", addr: "a", connected: true, error: "" },
        { path: "/offline", name: "offline", addr: "", connected: false, starting: false, error: "" },
      ],
      sessionsByWorkspace: { "/loaded": [] },
      loadingSessions: {},
    });

    await useWorkspaceStore.getState().prefetchSessions();

    expect(api.sessions).toHaveBeenCalledTimes(1);
    expect(api.sessions).toHaveBeenCalledWith("/fresh");
    expect(useWorkspaceStore.getState().sessionsByWorkspace["/fresh"]).toHaveLength(1);
  });
});
