import { fireEvent, render, screen } from "./solid-testing";
import { describe, expect, test, vi } from "vitest";
import { Toast } from "@/components/shell/Toast";
import { notify, notifySession, useNotifyStore } from "@lingzhu/app/store/notify";

describe("completion notice", () => {
  test("carries a headline and one line of detail instead of one long sentence", () => {
    render(
      () => <Toast title="Fix the build finished" body="The run is done." tone="success" onDone={() => undefined} />,
    );
    expect(screen.getByText("Fix the build finished")).toBeTruthy();
    expect(screen.getByText("The run is done.")).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("success");
  });

  test("returns to the session the notice is about", () => {
    const open = vi.fn();
    const done = vi.fn();
    render(
      () => <Toast
        title="Fix the build finished"
        tone="success"
        target={{ workspace: "/w", sessionID: "s1" }}
        onOpen={open}
        onDone={done}
      />,
    );
    fireEvent.click(screen.getByText("Fix the build finished"));
    expect(open).toHaveBeenCalledWith({ workspace: "/w", sessionID: "s1" });
    expect(done).toHaveBeenCalled();
  });

  test("keeps the dismiss button from opening the session", () => {
    const open = vi.fn();
    const done = vi.fn();
    render(
      () => <Toast
        title="Fix the build finished"
        target={{ workspace: "/w", sessionID: "s1" }}
        onOpen={open}
        onDone={done}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(open).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalled();
  });

  test("a plain notice has no session affordance", () => {
    render(() => <Toast title="Copied to clipboard" tone="info" onDone={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Open session" })).toBeNull();
    expect(screen.getByRole("status").getAttribute("data-openable")).toBeNull();
  });

  test("a session notice keeps the session it names", () => {
    useNotifyStore.getState().dismiss();
    notifySession({
      title: "Fix the build finished",
      body: "The run is done.",
      target: { workspace: "/w", sessionID: "s1" },
    });
    const notice = useNotifyStore.getState().notice;
    expect(notice?.tone).toBe("success");
    expect(notice?.target).toEqual({ workspace: "/w", sessionID: "s1" });

    notify("permission denied");
    expect(useNotifyStore.getState().notice?.tone).toBe("error");
    expect(useNotifyStore.getState().notice?.target).toBeUndefined();
  });
});
