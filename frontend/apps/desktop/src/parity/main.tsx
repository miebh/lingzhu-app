import { createRoot } from "react-dom/client";
import { Messages } from "@lingzhu/session-ui/Messages";
import { SideTabs } from "@/components/shell/SideTabs";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { SegmentedControl } from "@lingzhu/ui/segmented-control";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { setPierreAvailable } from "@lingzhu/session-ui/pierre";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";
import "@lingzhu/ui/theme.css";

setPierreAvailable(true);

const diff = (file: string) =>
  ["--- a/" + file, "+++ b/" + file, "@@ -1,2 +1,2 @@", "-const before = 1;", "+const after = \"yes\";", "+const obj = { key: 2 };", " const label = \"steady\";", " const view = new Widget();", " export {};", ""].join("\n");

const chat = (id: string, entries: TimelineEntry[]): ChatState =>
  ({
    id,
    title: "Parity",
    workspace: ".",
    entries,
    running: false,
    tokens: 0,
    window: 1000,
    pending: [],
    questions: [],
    loading: false,
    draft: false,
  }) as unknown as ChatState;

function tool(id: string, name: string, args: string, extra: Partial<TimelineEntry["tool"]> = {}): TimelineEntry {
  return { key: id, role: "tool", tool: { id, name, arguments: args, done: true, ...extra } };
}

const tools: TimelineEntry[] = [
  tool("read-1", "read", '{"path":"src/app.ts"}'),
  tool("read-image", "read", '{"path":"pixel.png"}', { attachments: [{ mime: "image/png", name: "pixel.png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }] }),
  tool("read-loaded", "read", '{"path":"AGENTS.md"}', { metadata: { loaded: ["/repo/AGENTS.md"] } }),
  tool("edit-1", "edit", '{"path":"src/edit.ts"}', { diff: diff("src/edit.ts") }),
  tool("read-2", "read", '{"path":"src/separator.ts"}'),
  tool("edit-diag", "edit", '{"path":"src/bad.ts"}', {
    diff: diff("src/bad.ts"),
    metadata: { diagnostics: [{ severity: "error", message: "expected ';'", line: 2, column: 3 }] },
  }),
  tool("shell-1", "shell", '{"command":"echo hi"}', { output: "hi" }),
  tool("execute-1", "execute", '{"code":"return 1"}', {
    metadata: {
      code: "return 1",
      toolCalls: [{ tool: "read", status: "completed", input: { path: "a.ts" } }],
      output: "1",
    },
  }),
  tool("agent-1", "subagent", JSON.stringify({ agent: "general", description: "inspect tests" }), {
    done: false,
    output: "sessionID: sub_parity",
  }),
  tool("question-1", "question", JSON.stringify({ questions: [{ question: "Which one?" }] }), {
    metadata: { answers: [["Alpha"]] },
  }),
  tool("search-1", "websearch", '{"query":"today"}', {
    output: "https://example.com/result",
    metadata: { provider: "brave" },
  }),
  tool("fetch-1", "webfetch", '{"url":"https://example.com/page"}'),
  tool("patch-multi", "patch", '{"patchText":"multi"}', { diff: diff("src/one.ts") + diff("src/two.ts") }),
  tool("browser-1", "browser", '{"url":"https://example.com"}'),
  tool("imagegen-1", "imagegen", '{"prompt":"a cat"}'),
  tool("skill-1", "skill", '{"id":"demo"}', { metadata: { name: "demo" } }),
  tool("failed-1", "shell", '{"command":"false"}', { failed: true, output: "Error: boom" }),
  { key: "notice-1", role: "notice", text: "Background job completed: npm test" },
  { key: "user-image", role: "user", text: "看这张图", attachments: [{ mime: "image/png", name: "pixel.png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }] },
];

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <Messages detail="everything" chat={chat("parity-page", tools)} />
  </TooltipProvider>,
);

const grouped: TimelineEntry[] = [];
for (let index = 0; index < 12; index += 1) {
  grouped.push({ key: `u${index}`, role: "user", text: `ask ${index}` });
  grouped.push({ key: `a${index}`, role: "assistant", text: `answer ${index}` });
  grouped.push(tool(`g${index}`, "read", `{"path":"f${index}.ts"}`));
  grouped.push(tool(`q${index}`, "grep", `{"pattern":"x${index}"}`));
}

createRoot(document.getElementById("group-root")!).render(
  <TooltipProvider>
    <Messages detail="compact" chat={chat("parity-group", grouped)} />
  </TooltipProvider>,
);

const stickyEntries: TimelineEntry[] = [
  { key: "su", role: "user", text: "scroll probe" },
  { key: "sa", role: "assistant", text: "working" },
  ...Array.from({ length: 40 }, (_, index) =>
    tool(`sticky-${index}`, "shell", `{"command":"echo ${index}"}`, { output: "ok" }),
  ),
];

createRoot(document.getElementById("sticky-root")!).render(
  <TooltipProvider>
    <Messages detail="compact" chat={chat("parity-sticky", stickyEntries)} />
  </TooltipProvider>,
);

// The shell surfaces: side rail rows, home rows and the review segmented control.
function ShellParity() {
  const workspaces = [{ path: ".", name: "Project", addr: "", connected: true, error: "" }];
  const rows = [
    {
      key: "k1",
      path: ".",
      sessionID: "s1",
      title: "Today work",
      workspaceName: "Project",
      updated: new Date().toISOString(),
    },
  ];
  return (
    <div style={{ display: "flex", gap: 16, width: 720 }}>
      <SideTabs
        tabs={[
          { key: "a", label: "First", subtitle: "Project", kind: "chat", closable: true },
          { key: "b", label: "Second", subtitle: "Project", kind: "chat", closable: true },
        ]}
        activeKey="a"
        onSelect={() => undefined}
        onClose={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
        width={240}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <HomeDashboard
          workspaces={workspaces}
          activePath="."
          rows={rows}
          onOpenSession={() => undefined}
          onSelectWorkspace={() => undefined}
          onNewSession={() => undefined}
        />
        <div style={{ padding: 8 }}>
          <SegmentedControl
            label="Diff layout"
            value="unified"
            onChange={() => undefined}
            options={[
              { value: "unified", label: "Unified" },
              { value: "split", label: "Split" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("shell-root")!).render(
  <TooltipProvider>
    <ShellParity />
  </TooltipProvider>,
);

// The harness drives clicks and measurements from the browser console.
(window as unknown as { __parityReady: boolean }).__parityReady = true;