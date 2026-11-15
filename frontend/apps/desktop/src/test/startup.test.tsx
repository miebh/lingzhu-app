import { describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AppShell } from "@lingzhu/app/app/AppShell";
import { useWorkspaceStore } from "@lingzhu/app/store/workspaces";
import { useChatStore } from "@lingzhu/app/store/chat";
import { useViewStore } from "@lingzhu/app/store/view";
import { usePreferencesStore } from "@lingzhu/app/store/preferences";
import { defaultPreferences } from "@lingzhu/app/lib/preferences";

describe("app startup", () => {
  test("renders without a React update-depth error", async () => {
    useWorkspaceStore.setState({
      workspaces: [{ path: "/w", name: "lingzhu", addr: "127.0.0.1:1", connected: true, error: "" }],
      activePath: "/w",
      loadingSessions: {},
      sessionsByWorkspace: {},
    });
    useChatStore.setState({ chats: {}, activeByWorkspace: {} });
    useViewStore.setState({ tab: "chat", homeOpen: true, settingsOpen: false });
    usePreferencesStore.setState({ preferences: defaultPreferences });

    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    });

    render(<AppShell />);

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    spy.mockRestore();

    // `useShell` is a plain hook every surface calls, so an effect inside it
    // would run once per caller and feed the stores back into each other.
    expect(errors.filter((line) => line.includes("Maximum update depth"))).toEqual([]);
  });
});
