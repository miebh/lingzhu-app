import { render, waitFor } from "@testing-library/react";
import { afterEach, test, expect } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { setPierreAvailable } from "@lingzhu/session-ui/pierre";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";

const chat = (entries: TimelineEntry[]): ChatState =>
  ({
    id: "pierre-chain",
    title: "Session",
    workspace: ".",
    entries,
    running: false,
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  }) as unknown as ChatState;

afterEach(() => setPierreAvailable(undefined));

test("a file row mounts the Pierre renderer with highlighted lines", async () => {
  setPierreAvailable(true);
  const patch = [
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,2 +1,3 @@",
    "-const x = 1;",
    "+const x = 2;",
    "+const y = 3;",
    " export {};",
    "",
  ].join("\n");
  const { container } = render(
    <TooltipProvider>
      <Messages
        detail="everything"
        chat={chat([
          {
            key: "edit",
            role: "tool",
            tool: { id: "edit-1", name: "edit", arguments: '{"path":"a.ts"}', diff: patch, done: true },
          },
        ])}
      />
    </TooltipProvider>,
  );

  const host = await waitFor(() => {
    const node = container.querySelector("diffs-container");
    expect(node).toBeTruthy();
    return node as HTMLElement;
  });
  const shadow = host.shadowRoot!;
  await waitFor(() => expect(shadow.querySelector("[data-diff]")).toBeTruthy());
  expect(shadow.querySelector("[data-column-number]")).toBeTruthy();
  expect(shadow.querySelector("[data-line-type='change-addition']")).toBeTruthy();
  expect(shadow.textContent).toContain("const");
  expect(shadow.querySelector("[data-code] span[style*='color']")).toBeTruthy();

  const mount = container.querySelector<HTMLElement>('[data-slot="diff-pierre"]');
  const scroll = container.querySelector<HTMLElement>('[data-slot="diff-scroll"]');
  expect(mount?.dataset.renderer).toBe("plain");
  expect(scroll?.getAttribute("style")).toContain("--diffs-line-height: 24px");
  expect(mount?.getAttribute("data-available")).toBe("true");
});

test("a long file row mounts the reference VirtualizedFileDiff renderer", async () => {
  setPierreAvailable(true);
  const body = Array.from({ length: 260 }, (_, index) => `+const value${index} = ${index};`).join("\n");
  const patch = `--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,260 @@\n${body}\n`;
  const { container } = render(
    <TooltipProvider>
      <Messages
        detail="everything"
        chat={chat([
          {
            key: "edit",
            role: "tool",
            tool: { id: "edit-long", name: "edit", arguments: '{"path":"a.ts"}', diff: patch, done: true },
          },
        ])}
      />
    </TooltipProvider>,
  );

  const mount = await waitFor(() => {
    const node = container.querySelector<HTMLElement>('[data-slot="diff-pierre"]');
    expect(node).toBeTruthy();
    return node!;
  });
  await waitFor(() => expect(mount.dataset.renderer).toBe("virtualized"));
  expect(mount.querySelector("diffs-container")).toBeTruthy();
  expect(container.querySelector('[data-slot="diff-scroll"]')).toBeTruthy();
});
