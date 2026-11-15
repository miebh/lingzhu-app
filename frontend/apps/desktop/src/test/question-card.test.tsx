import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { QuestionCard } from "@/components/QuestionCard";
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
      <QuestionCard
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
      <QuestionCard
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
      <QuestionCard
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
      <QuestionCard
        onReply={onReply}
        requests={[request([{ header: "Only", question: "Pick one", options: [{ label: "Alpha", description: "" }] }])]}
      />,
    );

    await userEvent.click(screen.getByText("Alpha"));
    await userEvent.type(screen.getByLabelText("Custom answer for Only"), "Delta");
    await userEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(onReply).toHaveBeenCalledWith("q1", { answers: [["Delta"]] });
  });
});
