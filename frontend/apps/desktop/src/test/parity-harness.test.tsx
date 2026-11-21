import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "./solid-testing";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, test } from "vitest";
import { Messages } from "@lingzhu/session-ui/Messages";
import { TooltipProvider } from "@lingzhu/ui/tooltip";
import { setPierreAvailable } from "@lingzhu/session-ui/pierre";
import type { ChatState, TimelineEntry } from "@lingzhu/ui/types";

function componentStyles() {
  const css = stylesheet();
  const chunks: string[] = [];
  let from = 0;
  while (true) {
    const start = css.indexOf("@layer components {", from);
    if (start < 0) break;
    let depth = 0;
    let end = start;
    for (let index = css.indexOf("{", start); index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    chunks.push(css.slice(css.indexOf("{", start) + 1, end));
    from = end + 1;
  }
  return chunks.join("\n");
}

function stylesheet() {
  const root = path.resolve(import.meta.dirname, "../../../../packages/ui/src");
  const styles = path.join(root, "styles");
  const entry = readFileSync(path.join(root, "theme.css"), "utf8");
  const names = [...entry.matchAll(/@import "\.\/styles\/([^"]+)"/g)].map((match) => match[1]);
  const order = names.length > 0 ? names : readdirSync(styles).filter((name) => name.endsWith(".css")).sort();
  return [entry, ...order.map((name) => readFileSync(path.join(styles, name), "utf8"))].join("\n");
}

function block(css: string, opener: string) {
  const exact = css.indexOf(`${opener} {`);
  const start = exact >= 0 ? exact : css.indexOf(opener);
  if (start < 0) return "";
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(css.indexOf("{", start) + 1, index);
    }
  }
  return "";
}

function declarations(text: string) {
  const map = new Map<string, string>();
  for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) map.set(`--${match[1]}`, match[2].trim());
  return map;
}

function schemeTokens(scheme: "dark" | "light") {
  const css = stylesheet();
  const tokens = declarations(css);
  for (const [key, value] of declarations(block(css, `[data-color-scheme="${scheme}"]`))) tokens.set(key, value);
  return tokens;
}

function resolveToken(tokens: Map<string, string>, name: string) {
  let value = tokens.get(name) ?? "";
  for (let depth = 0; depth < 12 && value.includes("var("); depth += 1) {
    value = value.replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, token: string, fallback: string | undefined) =>
      tokens.get(token) ?? fallback ?? "",
    );
  }
  return value.trim();
}

function rule(css: string, selector: string) {
  const index = css.indexOf(`${selector} {`);
  if (index < 0) return "";
  return block(css.slice(index), `${selector} {`);
}

function declaration(body: string, property: string) {
  const match = body.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  return match?.[1].trim() ?? "";
}


beforeAll(() => {
  if (document.getElementById("parity-component-css")) return;
  const style = document.createElement("style");
  style.id = "parity-component-css";
  style.textContent = componentStyles();
  document.head.append(style);
});

afterEach(() => setPierreAvailable(undefined));

const diff = (file: string) =>
  ["--- a/" + file, "+++ b/" + file, "@@ -1,2 +1,2 @@", "-const before = 1;", "+const after = 1;", " export {};", ""].join("\n");

const chat = (entries: TimelineEntry[]): ChatState =>
  ({
    id: "parity-harness",
    title: "Parity",
    workspace: ".",
    entries,
    running: false,
    tokens: 0,    pending: [],
    questions: [],
    loading: false,
    draft: false,
  }) as unknown as ChatState;

function tool(id: string, name: string, args: string, extra: Partial<TimelineEntry["tool"]> = {}): TimelineEntry {
  return { key: id, role: "tool", tool: { id, name, arguments: args, done: true, ...extra } };
}

test("compact tool groups keep the reference sticky header", async () => {
  setPierreAvailable(true);
  const entries: TimelineEntry[] = [];
  for (let index = 0; index < 12; index += 1) {
    entries.push({ key: `u${index}`, role: "user", text: `ask ${index}` });
    entries.push({ key: `a${index}`, role: "assistant", text: `answer ${index}` });
    entries.push(tool(`read-${index}`, "read", `{"path":"f${index}.ts"}`));
    entries.push(tool(`grep-${index}`, "grep", `{"pattern":"x${index}"}`));
  }
  const { container } = render(
    () => <TooltipProvider>
      <Messages detail="compact" chat={chat(entries)} />
    </TooltipProvider>,
  );

  const used = await waitFor(() => {
    const button = container.querySelector<HTMLElement>('[data-component="context-tool-group-trigger"]')?.closest<HTMLElement>('[data-slot="collapsible-trigger"]');
    expect(button).toBeTruthy();
    return button!;
  });
  await userEvent.click(used);
  await waitFor(() => expect(used.getAttribute("aria-expanded")).toBe("true"));
  const style = getComputedStyle(used);
  expect(style.position).toBe("sticky");
  expect(style.zIndex).toBe("21");
});

test("representative tools mount the production surfaces with reference geometry", async () => {
  setPierreAvailable(true);
  const { container } = render(
    () => <TooltipProvider>
      <Messages
        detail="everything"
        chat={chat([
          tool("read-1", "read", '{"path":"src/app.ts"}'),
          tool("edit-1", "edit", '{"path":"src/edit.ts"}', { diff: diff("src/edit.ts") }),
          tool("read-2", "read", '{"path":"src/read.ts"}'),
          tool("write-1", "write", '{"path":"src/write.ts"}', { diff: diff("src/write.ts") }),
          tool("read-3", "read", '{"path":"src/read2.ts"}'),
          tool("patch-1", "patch", '{"path":"src/patch.ts"}', { diff: diff("src/patch.ts") }),
          tool("read-4", "read", '{"path":"src/separator.ts"}'),
          tool("edit-2", "edit", '{"path":"src/bad.ts"}', {
            diff: diff("src/bad.ts"),
            metadata: {
              diagnostics: [{ severity: "error", message: "expected ';'", line: 2, column: 3 }],
            },
          }),
          tool("read-loaded", "read", '{"path":"AGENTS.md"}', {
            metadata: { loaded: ["/repo/AGENTS.md"] },
          }),
          tool("skill-1", "skill", '{"id":"demo"}', { metadata: { name: "demo" } }),
          { key: "notice-1", role: "notice", text: "Background job completed: npm test" },
          tool("shell-1", "shell", '{"command":"echo hi"}', { output: "hi" }),
          tool("execute-1", "execute", '{"code":"return 1"}', {
            metadata: { code: "return 1", toolCalls: [{ tool: "read", status: "completed", input: { path: "a.ts" } }], output: "1" },
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
          tool("failed-1", "shell", '{"command":"false"}', { failed: true, output: "Error: boom" }),
        ])}
      />
    </TooltipProvider>,
  );

  await waitFor(() => expect(container.querySelector('diffs-container')).toBeTruthy());
  await userEvent.click(screen.getByRole("button", { name: /Execute/ }));
  await userEvent.click(screen.getByRole("button", { name: /Brave Web Search/ }));

  // Structure: each representative tool uses its dedicated production surface.
  expect(container.querySelector('[data-component="read-tool-group"]')).toBeTruthy();
  expect(container.querySelector('[data-component="edit-tool"]')).toBeTruthy();
  expect(container.querySelector('[data-component="write-tool"]')).toBeTruthy();
  expect(container.querySelector('[data-component="apply-patch-tool"]')).toBeTruthy();
  expect(container.querySelectorAll("diffs-container").length).toBeGreaterThanOrEqual(3);
  expect(container.querySelector('[data-component="bash-output"]')).toBeTruthy();
  expect(container.querySelector('[data-component="execute-tool-calls"]')).toBeTruthy();
  expect(container.querySelector('[data-component="task-tool-card"]')).toBeTruthy();
  expect(container.querySelector('[data-component="question-answers"]')).toBeTruthy();
  expect(container.querySelector('[data-component="exa-tool-output"]')).toBeTruthy();
  expect(container.querySelector("a.webfetch-link")).toBeTruthy();
  expect(container.querySelector('[data-kind="tool-error-card"]')).toBeTruthy();

  // Remaining tool surfaces: diagnostics, loaded rows, skill, notices and the
  // suppressed todo tool.
  const diagnostics = container.querySelector<HTMLElement>('[data-component="diagnostics"]')!;
  expect(diagnostics).toBeTruthy();
  expect(diagnostics.textContent).toContain("Error");
  expect(diagnostics.textContent).toContain("[2:3]");
  expect(diagnostics.textContent).toContain("expected ';'");
  expect(getComputedStyle(diagnostics).padding).toBe("8px 12px");
  expect(getComputedStyle(diagnostics).gap).toBe("4px");

  const loaded = container.querySelector<HTMLElement>('[data-component="tool-loaded-item"][aria-label^="Loaded /repo/AGENTS.md"]');
  expect(loaded).toBeTruthy();
  expect(loaded?.textContent).toContain("AGENTS.md");
  const skill = container.querySelector<HTMLElement>('[data-component="tool-loaded-item"][aria-label="Loaded demo skill"]');
  expect(skill).toBeTruthy();
  expect(skill?.textContent).toContain("demo");
  expect(skill?.querySelector('[data-slot="tool-loaded-kind"]')?.textContent).toBe("skill");

  expect(container.textContent).toContain("Background job completed: npm test");

  // Geometry: explicit reference values in the component stylesheet.
  const shellTrigger = container.querySelector<HTMLElement>('[data-component="collapsible"][data-compact="true"] > [data-slot="collapsible-trigger"]')!;
  expect(getComputedStyle(shellTrigger).height).toBe("28px");

  const accordion = container.querySelector<HTMLElement>('[data-slot="accordion-trigger"]')!;
  expect(getComputedStyle(accordion).height).toBe("32px");
  expect(getComputedStyle(accordion).paddingTop).toBe("8px");
  expect(getComputedStyle(accordion).paddingLeft).toBe("12px");
  expect(getComputedStyle(accordion).borderTopWidth).toBe("1px");
  expect(getComputedStyle(accordion).borderTopStyle).toBe("solid");

  const errorCard = container.querySelector<HTMLElement>('[data-kind="tool-error-card"]')!;
  expect(getComputedStyle(errorCard).borderTopWidth).toBe("0px");
  expect(["transparent", "rgba(0, 0, 0, 0)"]).toContain(getComputedStyle(errorCard).backgroundColor);

  const callRow = container.querySelector<HTMLElement>('[data-component="execute-tool-calls"] [data-slot="execute-tool-call"]')!;
  expect(getComputedStyle(callRow).display).toBe("flex");
  expect(getComputedStyle(callRow).gap).toBe("6px");
  expect(getComputedStyle(callRow.querySelector<HTMLElement>('[data-slot="execute-tool-call-marker"]')!).width).toBe("14px");

  const diffHost = container.querySelector<HTMLElement>("diffs-container")!;
  expect(diffHost.closest<HTMLElement>('[data-slot="diff-scroll"]')?.getAttribute("style")).toContain("--diffs-line-height: 24px");

  // Diff internals come from the Pierre shadow root.
  const host = container.querySelector<HTMLElement>("diffs-container")!;
  await waitFor(() => expect(host.shadowRoot?.querySelector("[data-diff]")).toBeTruthy());
  const shadow = host.shadowRoot!;
  expect(shadow.querySelector("[data-column-number]")).toBeTruthy();
  expect(shadow.querySelector("[data-line-type='change-addition']")).toBeTruthy();
  expect(shadow.querySelector("[data-code] span[style*='color']")).toBeTruthy();

  // Sticky group and file headers keep the reference positioning.
  const groupTrigger = container.querySelector<HTMLElement>('[data-component="collapsed-tool-group"] [data-slot="collapsible-trigger"]');
  if (groupTrigger) expect(getComputedStyle(groupTrigger).position).toBe("sticky");
  expect(getComputedStyle(container.querySelector<HTMLElement>('[data-component="sticky-accordion-header"]')!).position).toBe("sticky");

  // Resolved syntax colours match the app theme exactly.
  const dark = schemeTokens("dark");
  const light = schemeTokens("light");
  expect(resolveToken(dark, "--syntax-keyword")).toBe("#ffffff6c");
  expect(resolveToken(dark, "--syntax-string")).toBe("#00ceb9");
  expect(resolveToken(dark, "--syntax-property")).toBe("#ff9ae2");
  expect(resolveToken(dark, "--syntax-type")).toBe("#ecf58c");
  expect(resolveToken(dark, "--syntax-constant")).toBe("#93e9f6");
  expect(resolveToken(dark, "--syntax-variable")).toBe("#ffffffef");
  expect(resolveToken(light, "--syntax-keyword")).toBe("#8f8f8f");
  expect(resolveToken(light, "--syntax-string")).toBe("#017853");
  expect(resolveToken(light, "--syntax-property")).toBe("#016142");
  expect(resolveToken(light, "--syntax-type")).toBe("#024c34");
  expect(resolveToken(light, "--syntax-constant")).toBe("#017853");
  expect(resolveToken(light, "--syntax-variable")).toBe("#171717");

  // Typography roles resolve to the reference 13px/530/16px/-0.04px.
  const components = componentStyles();
  const titleRule = rule(components, '[data-component="tool-trigger"] [data-slot="basic-tool-tool-title"]');
  expect(declaration(titleRule, "font-size")).toBe("var(--text-body)");
  expect(declaration(titleRule, "font-weight")).toBe("530");
  expect(declaration(titleRule, "letter-spacing")).toBe("-0.04px");
  expect(resolveToken(dark, "--text-body")).toBe("13px");
  expect(resolveToken(dark, "--text-caption--line-height")).toBe("16px");
  expect(resolveToken(dark, "--font-mono")).toContain("IBM Plex Mono");

  const loadedRule = rule(components, '[data-component="tool-loaded-item"]');
  expect(declaration(loadedRule, "gap")).toBe("6px");
  const diagnosticsRule = rule(components, '[data-component="diagnostics"]');
  expect(declaration(diagnosticsRule, "padding")).toBe("8px 12px");
  expect(declaration(diagnosticsRule, "gap")).toBe("4px");
});
