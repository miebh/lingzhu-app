import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ConfirmDialog, MoveSessionDialog, RenameDialog, WorktreeDialog } from "@/components/Dialogs";
import { SummaryDialog } from "@/components/SummaryDialog";
import { setLanguage } from "@lingzhu/ui/i18n";

describe("dialogs surfaces", () => {
  test("dialog closes through its action", async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete session"
        description="This cannot be undone."
        confirmLabel="Delete"
        onOpenChange={onOpenChange}
        onConfirm={() => undefined}
      />,
    );
    expect(await screen.findByText("Delete session")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Cancel|取消/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("rename dialog localizes to Chinese", async () => {
    setLanguage("zh");
    render(
      <RenameDialog open initial="Session" onOpenChange={() => undefined} onConfirm={() => undefined} />,
    );
    expect(await screen.findByText("重命名会话")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
    setLanguage("en");
  });

  test("worktree and move dialogs localize to Chinese", async () => {
    setLanguage("zh");
    render(
      <WorktreeDialog open onOpenChange={() => undefined} onConfirm={() => undefined} />,
    );
    expect(await screen.findByText("新建工作树")).toBeTruthy();
    expect(screen.getByRole("button", { name: "创建" })).toBeTruthy();
    render(
      <MoveSessionDialog open workspaces={[]} onOpenChange={() => undefined} onConfirm={() => undefined} />,
    );
    expect(await screen.findByText("移动会话")).toBeTruthy();
    expect(screen.getByText("请先添加另一个工作区。")).toBeTruthy();
    setLanguage("en");
  });

  test("dialog also closes with Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete session"
        description="This cannot be undone."
        confirmLabel="Delete"
        onOpenChange={onOpenChange}
        onConfirm={() => undefined}
      />,
    );
    await screen.findByText("Delete session");
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("summary dialog shows the generated summary", () => {
    render(<SummaryDialog open title="Session" text="I added X." loading={false} error="" onOpenChange={() => {}} />);
    expect(screen.getByText("Session summary")).toBeTruthy();
    expect(screen.getByText("I added X.")).toBeTruthy();
  });
});
