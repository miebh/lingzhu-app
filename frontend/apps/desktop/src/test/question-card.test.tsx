import { render, screen } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { QuestionCard } from "@/components/session/QuestionCard";
import type { QuestionRequest } from "@lingzhu/ui/types";

const request = (questions: QuestionRequest["questions"]): QuestionRequest => ({
  id: "q1",
  sessionId: "s1",
  questions,
});

describe("question dock", () => {
  test("several questions advance one step at a time", async () => {
    const onReply = vi.fn();
    render(
      () => <QuestionCard
        onReply={onReply}
        requests={[
          request([
            { header: "First", question: "Pick one", options: [{ label: "Alpha", description: "" }, { label: "Beta", description: "" }] },
            { header: "Second", question: "Pick another", options: [{ label: "Gamma", description: "" }] },
          ]),
        ]}
      />,
    );

    // Only the first question is on screen.
    expect(screen.getByText("Pick one")).toBeTruthy();
    expect(screen.queryByText("Pick another")).toBeNull();
    expect(screen.getByText("1 of 2")).toBeTruthy();

    await userEvent.click(screen.getByText("Alpha"));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Pick another")).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();

    await userEvent.click(screen.getByText("Gamma"));
    await userEvent.click(screen.getByRole("button", { name: "Answer" }));

    expect(onReply).toHaveBeenCalledWith("q1", { answers: [["Alpha"], ["Gamma"]] });
  });

  test("a single question answers in place without a progress row", async () => {
    const onReply = vi.fn();
    render(
      () => <QuestionCard
        onReply={onReply}
        requests={[request([{ header: "Only", question: "Pick one", options: [{ label: "Alpha", description: "" }] }])]}
      />,
    );

    expect(screen.queryByText("1 of 1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await userEvent.click(screen.getByText("Alpha"));
    await userEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(onReply).toHaveBeenCalledWith("q1", { answers: [["Alpha"]] });
  });

  test("the progress row marks the current and answered steps", async () => {
    render(
      () => <QuestionCard
        onReply={() => undefined}
        requests={[
          request([
            { header: "First", question: "Pick one", options: [{ label: "Alpha", description: "" }] },
            { header: "Second", question: "Pick another", options: [{ label: "Gamma", description: "" }] },
          ]),
        ]}
      />,
    );

    const segments = document.querySelectorAll('[data-slot="question-progress-segment"]');
    expect(segments).toHaveLength(2);
    expect(segments[0].getAttribute("data-active")).toBe("true");
    expect(segments[0].getAttribute("data-answered")).toBeNull();

    await userEvent.click(screen.getByText("Alpha"));
    expect(segments[0].getAttribute("data-answered")).toBe("true");

    await userEvent.click(screen.getByRole("button", { name: "Question 2" }));
    expect(segments[1].getAttribute("data-active")).toBe("true");
    expect(segments[0].getAttribute("data-active")).toBeNull();
  });

  test("a typed answer takes precedence over a picked option", async () => {
    const onReply = vi.fn();
    render(
      () => <QuestionCard
        onReply={onReply}
        requests={[request([{ header: "Only", question: "Pick one", options: [{ label: "Alpha", description: "" }] }])]}
      />,
    );

    await userEvent.click(screen.getByText("Alpha"));
    await userEvent.type(screen.getByLabelText("Custom answer for Only"), "Delta");
    await userEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(onReply).toHaveBeenCalledWith("q1", { answers: [["Delta"]] });
  });

  test("MCP elicitation renders every field in one form", async () => {
    const onReply = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      () => <QuestionCard
        onReply={onReply}
        requests={[
          request([
            {
              header: "Approve",
              title: "MCP · release",
              question: "Allow publish?",
              options: [
                { label: "true", description: "" },
                { label: "false", description: "" },
              ],
              kind: "boolean",
              required: true,
            },
            { header: "Name", question: "Release name", options: [], kind: "text", required: true },
            {
              header: "Channel",
              question: "Pick a channel",
              options: [
                { label: "stable", description: "" },
                { label: "beta", description: "" },
              ],
              kind: "select",
            },
            {
              header: "Authorize",
              question: "Authorize access",
              options: [],
              kind: "external",
              url: "https://example.com/auth",
            },
          ]),
        ]}
      />,
    );

    expect(screen.getByText("MCP · release")).toBeTruthy();
    expect(screen.getByText("Allow publish?")).toBeTruthy();
    expect(screen.getByText("Release name")).toBeTruthy();
    expect(screen.getByText("Pick a channel")).toBeTruthy();
    expect(screen.getByText("Authorize access")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole("switch", { name: "Approve" }));
    await userEvent.type(screen.getByLabelText("Name"), "v2");
    await userEvent.click(screen.getByText("stable"));
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(open).toHaveBeenCalledWith("https://example.com/auth", "_blank", "noopener,noreferrer");

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onReply).toHaveBeenCalledWith("q1", {
      answers: [["true"], ["v2"], ["stable"], []],
    });
    open.mockRestore();
  });
});
