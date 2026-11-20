import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { api } from "@/lib/api";
import { Composer } from "@/components/session/Composer";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { Messages } from "@lingzhu/session-ui/Messages";
import { SessionQueuePanel } from "@/components/session/SessionQueuePanel";
import { setLanguage } from "@lingzhu/ui/i18n";
import type { ChatState } from "@lingzhu/ui/types";
import { chat } from "./support/chat";

const { api: mockApi } = await vi.hoisted(async () => await import("./support/api-mock"));
vi.mock("@/lib/api", () => ({ api: mockApi }));

describe("composer surfaces", () => {
  test("composer exposes commands and model selection", async () => {
    const onSelectModel = vi.fn();
    const onSend = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[
            {
              id: "p",
              name: "Provider",
              ready: true,
              models: [{ id: "m", name: "Model A", contextWindow: 1000 }],
            } as never,
          ]}
          provider="p"
          model="m"
          commands={[{ name: "review", description: "Review changes", plugin: "builtin" } as never]}
          onSelectModel={onSelectModel}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={onSend}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Select model" }));
    await userEvent.click(await screen.findByRole("option", { name: /Model A/ }));
    expect(onSelectModel).toHaveBeenCalledWith("p", "m");

    const input = screen.getByLabelText("Prompt");
    await userEvent.type(input, "/");
    expect(await screen.findByText("/review")).toBeTruthy();
  });

  test("selecting a built-in command clears the composer", async () => {
    const run = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[{ name: "compact", description: "Compact the conversation", plugin: "builtin", run } as never]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const input = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await userEvent.type(input, "/");
    await screen.findByText("/compact");
    await userEvent.keyboard("{Enter}");
    expect(run).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });

  test("mod+enter sends with the alternate delivery", async () => {
    const onSend = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={onSend}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const input = screen.getByLabelText("Prompt");
    await userEvent.type(input, "follow up");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][1]).toBe("queue");
  });

  test("composer pastes an attachment and sends it with the prompt", async () => {
    const onSend = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={onSend}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const input = screen.getByLabelText("Prompt");
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    fireEvent.paste(input, { clipboardData: { files: [file] } });
    await screen.findByText("a.txt");
    await userEvent.type(input, "hi");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][2]).toHaveLength(1);
  });

  test("composer accepts a dropped file", async () => {
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const input = screen.getByLabelText("Prompt");
    const file = new File(["png"], "a.png", { type: "image/png" });
    fireEvent.drop(input.closest("form")!, { dataTransfer: { files: [file] } });
    await screen.findByAltText("a.png");
  });

  test("model picker selects a variant", async () => {
    const onSelectModel = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[
            {
              id: "p",
              name: "Provider",
              ready: true,
              models: [
                {
                  id: "m",
                  name: "Model A",
                  contextWindow: 1000,
                  variants: { max: {}, high: {}, low: {} },
                },
              ],
            } as never,
          ]}
          provider="p"
          model="m"
          commands={[]}
          onSelectModel={onSelectModel}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Select model" }));
    const option = await screen.findByRole("option", { name: /Model A/ });
    await userEvent.hover(option);
    const levels = (await screen.findAllByRole("menuitemradio")).map((item) => item.textContent?.trim());
    expect(levels).toEqual(["Default", "low", "high", "max"]);
    await userEvent.click(await screen.findByRole("menuitemradio", { name: /high/ }));
    expect(onSelectModel).toHaveBeenCalledWith("p", "m::high");
  });

  test("composer combines paste, drop, model variant and send", async () => {
    const onSelectModel = vi.fn();
    const onSend = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[
            {
              id: "p",
              name: "Provider",
              ready: true,
              models: [{ id: "m", name: "Model A", contextWindow: 1000, variants: { high: {} } }],
            } as never,
          ]}
          provider="p"
          model="m"
          commands={[]}
          onSelectModel={onSelectModel}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={onSend}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const input = screen.getByLabelText("Prompt");
    fireEvent.paste(input, {
      clipboardData: { files: [new File(["hello"], "a.txt", { type: "text/plain" })] },
    });
    await screen.findByText("a.txt");
    fireEvent.drop(input.closest("form")!, {
      dataTransfer: { files: [new File(["png"], "b.png", { type: "image/png" })] },
    });
    await screen.findByAltText("b.png");
    await userEvent.click(screen.getByRole("button", { name: "Select model" }));
    const option = await screen.findByRole("option", { name: /Model A/ });
    await userEvent.hover(option);
    await userEvent.click(await screen.findByRole("menuitemradio", { name: /high/ }));
    expect(onSelectModel).toHaveBeenCalledWith("p", "m::high");
    await userEvent.type(input, "hi");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][2]).toHaveLength(2);
  });

  test("composer variant picker selects a reasoning level", async () => {
    const onSelectModel = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[
            {
              id: "p",
              name: "Provider",
              ready: true,
              models: [
                { id: "m", name: "Model A", contextWindow: 1000, variants: { low: {}, high: {} } },
              ],
            } as never,
          ]}
          provider="p"
          model="m::high"
          commands={[]}
          onSelectModel={onSelectModel}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Reasoning level" });
    expect(trigger.textContent?.toLowerCase()).toContain("high");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitemradio", { name: /low/i }));
    expect(onSelectModel).toHaveBeenCalledWith("p", "m::low");
  });

  test("composer labels localize to Chinese", async () => {
    setLanguage("zh");
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    expect(screen.getByPlaceholderText("输入消息，/ 查看命令，@ 添加上下文…")).toBeTruthy();
    setLanguage("en");
  });

  test("composer add menu matches the reference entries", async () => {
    setLanguage("zh");
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "添加图片和文件" }));
    expect(await screen.findByText("图片和文件")).toBeTruthy();
    expect(screen.getByText("命令")).toBeTruthy();
    expect(screen.getByText("上下文")).toBeTruthy();
    setLanguage("en");
  });

  test("a quote lands in the composer draft", () => {
    const consumed = vi.fn();
    render(
      <Composer
        running={false}
        disabled={false}
        providers={[]}
        provider=""
        model=""
        commands={[]}
        quote={{ text: "Quoted answer", nonce: 1 }}
        onQuoteConsumed={consumed}
        onSelectModel={() => undefined}
        onManageModels={() => undefined}
        onAddProvider={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
      />,
    );
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain("> Quoted answer");
    expect(consumed).toHaveBeenCalled();
  });

  test("a consumed quote is not reinserted when the composer remounts", async () => {
    function Harness() {
      const [quote, setQuote] = useState<{ text: string; nonce: number } | undefined>({
        text: "Quoted answer",
        nonce: 1,
      });
      const [shown, setShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown((value) => !value)}>
            Toggle composer
          </button>
          {shown && (
            <Composer
              running={false}
              disabled={false}
              providers={[]}
              provider=""
              model=""
              commands={[]}
              quote={quote}
              onQuoteConsumed={() => setQuote(undefined)}
              onSelectModel={() => undefined}
              onManageModels={() => undefined}
              onAddProvider={() => undefined}
              onSend={() => undefined}
              onStop={() => undefined}
            />
          )}
        </>
      );
    }
    render(<Harness />);
    const area = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    expect(area.value).toContain("> Quoted answer");
    // Start a fresh draft, then unmount and remount the composer. The quote
    // was consumed on the first insert, so it must not come back.
    await userEvent.clear(area);
    await userEvent.click(screen.getByRole("button", { name: "Toggle composer" }));
    await userEvent.click(screen.getByRole("button", { name: "Toggle composer" }));
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toBe("");
  });

  test("queued prompts can be edited, switched and removed", async () => {
    const items = [
      {
        id: "i1",
        sessionID: "s1",
        type: "user" as const,
        delivery: "queue" as const,
        payload: { text: "queued hello" },
        time: { created: "" },
      },
    ];
    const onRemove = vi.fn();
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    render(
      <SessionQueuePanel
        items={items}
        onRemove={onRemove}
        onToggleDelivery={onToggle}
        onEdit={onEdit}
      />,
    );
    expect(screen.getByText("queued hello")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Change delivery for queued hello" }));
    expect(onToggle).toHaveBeenCalledWith(items[0]);
    await userEvent.click(screen.getByRole("button", { name: "Remove queued prompt queued hello" }));
    expect(onRemove).toHaveBeenCalledWith("i1");
    await userEvent.click(screen.getByRole("button", { name: "Edit queued prompt: queued hello" }));
    expect(onEdit).toHaveBeenCalledWith(items[0]);
  });

  test("composer @ search attaches a file", async () => {
    vi.mocked(api.searchFiles).mockResolvedValueOnce({ files: [{ path: "src/app.ts", size: 5 }], truncated: false });
    vi.mocked(api.fileContent).mockResolvedValueOnce({
      path: "src/app.ts",
      content: "hello",
      truncated: false,
      binary: false,
      size: 5,
    });
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          workspace="/w"
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const area = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await userEvent.type(area, "@ap");
    await userEvent.click(await screen.findByRole("option", { name: /src\/app\.ts/ }));
    expect(area.value).toBe("@src/app.ts ");
    expect(screen.getByText("src/app.ts")).toBeTruthy();
  });

  test("composer @ search selects an agent", async () => {
    const onSelectAgent = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          agents={[{ id: "build", name: "Build", description: "Build code", mode: "primary" }]}
          onSelectAgent={onSelectAgent}
          workspace="/w"
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const area = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await userEvent.type(area, "@bu");
    await userEvent.click(await screen.findByRole("option", { name: /@build/ }));
    expect(onSelectAgent).toHaveBeenCalledWith("build");
    expect(area.value).toBe("@build ");
  });

  test("composer ! enters shell mode and runs the command", async () => {
    const onRunShell = vi.fn();
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
          onRunShell={onRunShell}
        />
      </TooltipProvider>,
    );
    const area = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await userEvent.click(area);
    await userEvent.type(area, "!echo hi");
    expect(area.value).toBe("echo hi");
    expect(screen.getByText("Shell")).toBeTruthy();
    await userEvent.keyboard("{Enter}");
    expect(onRunShell).toHaveBeenCalledWith("echo hi");
    expect(area.value).toBe("");
  });

  test("shell mode recalls its own command history", async () => {
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          history={["prompt one"]}
          shellHistory={["git status", "npm test"]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
          onRunShell={() => undefined}
        />
      </TooltipProvider>,
    );
    const area = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await userEvent.click(area);
    await userEvent.type(area, "!");
    expect(area.value).toBe("");
    await userEvent.keyboard("{ArrowUp}");
    expect(area.value).toBe("git status");
    await userEvent.keyboard("{ArrowUp}");
    expect(area.value).toBe("npm test");
    await userEvent.keyboard("{ArrowDown}");
    expect(area.value).toBe("git status");
    await userEvent.keyboard("{ArrowDown}");
    expect(area.value).toBe("");
  });

  test("composer recalls previous prompts with the arrow keys", async () => {
    render(
      <TooltipProvider>
        <Composer
          running={false}
          disabled={false}
          providers={[]}
          provider=""
          model=""
          commands={[]}
          history={["second", "first"]}
          onSelectModel={() => undefined}
          onManageModels={() => undefined}
          onAddProvider={() => undefined}
          onSend={() => undefined}
          onStop={() => undefined}
        />
      </TooltipProvider>,
    );
    const area = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await userEvent.click(area);
    await userEvent.keyboard("{ArrowUp}");
    expect(area.value).toBe("second");
    await userEvent.keyboard("{ArrowUp}");
    expect(area.value).toBe("first");
    await userEvent.keyboard("{ArrowDown}");
    expect(area.value).toBe("second");
    await userEvent.keyboard("{ArrowDown}");
    expect(area.value).toBe("");
  });

  test("undo restores a sent prompt into the composer", async () => {
    function Harness() {
      const [restore, setRestore] = useState<{ text: string; nonce: number }>();
      return (
        <TooltipProvider>
          <button type="button" onClick={() => setRestore({ text: "first", nonce: Date.now() })}>
            Restore prompt
          </button>
          <Composer
            running={false}
            disabled={false}
            providers={[]}
            provider=""
            model=""
            commands={[]}
            restore={restore}
            onSelectModel={() => undefined}
            onManageModels={() => undefined}
            onAddProvider={() => undefined}
            onSend={() => undefined}
            onStop={() => undefined}
          />
        </TooltipProvider>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Restore prompt" }));
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toBe("first");
  });

  test("composer send appends a user turn to the timeline", async () => {
    function Harness() {
      const [entries, setEntries] = useState<ChatState["entries"]>([]);
      return (
        <TooltipProvider>
          <Messages chat={chat(entries)} />
          <Composer
            running={false}
            disabled={false}
            providers={[]}
            provider=""
            model=""
            commands={[]}
            onSelectModel={() => undefined}
            onManageModels={() => undefined}
            onAddProvider={() => undefined}
            onSend={(text) =>
              setEntries((current) => [...current, { key: `u${current.length}`, role: "user", text }])
            }
            onStop={() => undefined}
          />
        </TooltipProvider>
      );
    }
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Prompt"), "Hello flow");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hello flow")).toBeTruthy();
  });
});
