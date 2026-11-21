import { createEffect, createMemo, createSignal, createUniqueId, For, Match, onCleanup, Show, splitProps, Switch, type Accessor, type JSX } from "solid-js";
import {
  Code,
  ChevronsUpDown,
  ChevronRight,
  SquareArrow,
  TriangleAlert,
} from "@lingzhu/ui/icons";
import { Dialog, DialogContent, DialogTitle } from "@lingzhu/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { LinkedText } from "@lingzhu/ui/LinkedText";
import { TextShimmer } from "@lingzhu/ui/TextShimmer";
import { CopyButton, Markdown } from "./Markdown";
import { cn } from "@lingzhu/ui/utils";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { createTwoFilesPatch } from "diff";
import { reasoningDuration, reasoningHeading } from "@lingzhu/session-ui/reasoning";
import { formatExecuteOutput } from "@lingzhu/session-ui/execute-output";
import { noticeText } from "@lingzhu/session-ui/notice";
import { diffAvailable } from "@lingzhu/session-ui/pierre";
import { languageOf, tokenize } from "@lingzhu/session-ui/syntax";
import { PierreDiff } from "./PierreDiff";
import type { ContextPart } from "@lingzhu/session-ui/timeline";
import type {
  EntryAttachment,
  ShellRun,
  TimelineDetail,
  TimelineDetailInput,
  TimelineEntry,
  ToolRun,
} from "@lingzhu/ui/types";
import { timelineDetail } from "@lingzhu/session-ui/timeline-detail";
import { stripAnsi } from "@lingzhu/ui/format";
import { capitalize } from "@lingzhu/ui/text";
import { useT, t, type MessageKey } from "@lingzhu/ui/i18n";
import { disclosureView, useDisclosure } from "./disclosure";

type Args = Record<string, unknown>;

/**
 * One row per tool id. The title, subtitle, args and renderer live together so
 * adding a tool means adding one entry instead of editing every switch below.
 */
interface ToolSpec {
  title: MessageKey;
  /** File-change tools share the accordion renderer and the file grouping. */
  file?: boolean;
  subtitle?: (tool: ToolRun, args: Args) => string;
  args?: (tool: ToolRun, args: Args) => string[];
  render?: (tool: Accessor<ToolRun>, context: ToolRenderContext) => JSX.Element;
}

interface ToolRenderContext {
  detail: TimelineDetail;
  groupKey: string;
  onOpenSession?: (id: string) => void;
  workspace?: string;
  runningSubagents?: ReadonlySet<string>;
  shellOutput?: (tool: ToolRun) => ShellOutputSource | undefined;
  summaryOnly?: boolean;
}

/** Localized display name for a tool id; unknown MCP tools keep their raw name. */
function toolName(name: string): string {
  const spec = TOOL_SPECS[name];
  return spec ? t(spec.title) : name;
}

const isFileTool = (name: string) => TOOL_SPECS[name]?.file === true;
const IMAGE_PATH = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

// Parsed arguments are reused across a row's many call sites (title, subtitle,
// path, read args). The cache is keyed by the raw string, which is stable for a
// tool run, so re-rendering a card no longer re-parses the same JSON.
const ARG_CACHE_LIMIT = 512;
const argCache = new Map<string, Args>();

function parseArgs(raw: string): Args {
  const cached = argCache.get(raw);
  if (cached) return cached;
  let value: Args;
  try {
    const parsed = JSON.parse(raw || "{}");
    value = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Args) : {};
  } catch {
    value = {};
  }
  argCache.set(raw, value);
  if (argCache.size > ARG_CACHE_LIMIT) {
    const oldest = argCache.keys().next().value;
    if (oldest !== undefined) argCache.delete(oldest);
  }
  return value;
}

function stringArg(args: Args, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function numberArg(args: Args, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" ? value : undefined;
}

function splitPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return { directory: "", name: normalized };
  return { directory: normalized.slice(0, index + 1), name: normalized.slice(index + 1) };
}

function toolTitle(tool: ToolRun, args = parseArgs(tool.arguments)): string {
  if (tool.name === "subagent") {
    const agent = stringArg(args, "agent");
    return agent ? capitalize(agent) : toolName("subagent");
  }
  return toolName(tool.name);
}

const LABEL_KEYS = ["description", "query", "url", "path", "pattern", "name"];

function genericSubtitle(args: Args): string {
  for (const key of LABEL_KEYS) {
    const value = stringArg(args, key);
    if (value) return value;
  }
  return "";
}

function fileSubtitle(_tool: ToolRun, args: Args): string {
  return splitPath(stringArg(args, "path")).name;
}

function directorySubtitle(_tool: ToolRun, args: Args): string {
  return displayDirectory(stringArg(args, "path"));
}

function commandSubtitle(_tool: ToolRun, args: Args): string {
  return stringArg(args, "command");
}

function toolSubtitle(tool: ToolRun, args = parseArgs(tool.arguments)): string {
  return TOOL_SPECS[tool.name]?.subtitle?.(tool, args) ?? genericSubtitle(args);
}

function displayDirectory(path: string): string {
  return path || "/";
}

function genericArgs(args: Args): string[] {
  return Object.entries(args)
    .filter(([key, value]) => !LABEL_KEYS.includes(key) && ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 3)
    .map(([key, value]) => `${key}=${String(value)}`);
}

function patternArgs(_tool: ToolRun, args: Args): string[] {
  return stringArg(args, "pattern") ? [`pattern=${stringArg(args, "pattern")}`] : [];
}

function grepArgs(_tool: ToolRun, args: Args): string[] {
  return [
    stringArg(args, "pattern") ? `pattern=${stringArg(args, "pattern")}` : "",
    stringArg(args, "include") ? `include=${stringArg(args, "include")}` : "",
  ].filter(Boolean);
}

function toolArgs(tool: ToolRun, args = parseArgs(tool.arguments)): string[] {
  return TOOL_SPECS[tool.name]?.args?.(tool, args) ?? genericArgs(args);
}

function readArgs(args: Args): string[] {
  const offset = numberArg(args, "offset");
  const limit = numberArg(args, "limit");
  return [...(offset === undefined ? [] : [`offset=${offset}`]), ...(limit === undefined ? [] : [`limit=${limit}`])];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isImageRead(tool: ToolRun): boolean {
  return tool.name === "read" && IMAGE_PATH.test(stringArg(parseArgs(tool.arguments), "path"));
}

/** The child session a subagent tool call created or continued. */
function subagentSessionID(tool: ToolRun): string | undefined {
  const fromMetadata = tool.metadata?.sessionID;
  if (typeof fromMetadata === "string" && fromMetadata) return fromMetadata;
  const fromSession = stringArg(parseArgs(tool.arguments), "sessionID");
  if (fromSession) return fromSession;
  const match = /(?:subagent session|sessionID): (sub_[^)\s]+)/.exec(tool.output ?? "");
  return match?.[1];
}

function matchCount(tool: ToolRun, output: string): number | undefined {
  const metadata = tool.metadata ?? {};
  if (typeof metadata.matches === "number") return metadata.matches;
  if (typeof metadata.count === "number") return metadata.count;

  if (tool.name === "grep") {
    const match = output.match(/^Found (\d+) matches?/m);
    return match ? Number(match[1]) : undefined;
  }
  if (tool.name === "glob") {
    const lines = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("(") && line !== "No files found");
    return lines.length;
  }
  return undefined;
}

interface BasicToolProps {
  id?: string;
  title?: string;
  titleNode?: JSX.Element;
  trigger?: JSX.Element | ((open: boolean) => JSX.Element);
  subtitle?: string;
  subtitleNode?: JSX.Element;
  subtitleClass?: string;
  args?: string[];
  trailing?: JSX.Element;
  action?: JSX.Element;
  status?: string;
  pending?: boolean;
  allowOpenWhilePending?: boolean;
  compact?: boolean;
  rail?: boolean;
  hideDetails?: boolean;
  hideSubtitleWhenOpen?: boolean;
  hasContent?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  forceOpen?: boolean;
  onSubtitleClick?: () => void;
  triggerAsLink?: string;
  clickable?: boolean;
  ariaLabel?: string;
  onTriggerClick?: () => void;
  /** A locked row shows its content without offering a collapse affordance. */
  locked?: boolean;
  children?: JSX.Element;
}

function TriangleDown(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" class={local.class} {...rest}>
      <path d="M4 6.25 8 10l4-3.75H4Z" fill="currentColor" />
    </svg>
  );
}

function ToolArrow() {
  return (
    <span data-slot="collapsible-arrow" aria-hidden="true">
      <TriangleDown data-slot="collapsible-arrow-icon" />
    </span>
  );
}

export function BasicTool(props: BasicToolProps) {
  const generatedID = createUniqueId();
  const key = props.id ?? generatedID;
  const [storedOpen, setStoredOpen] = useDisclosure(key, props.defaultOpen ?? false);
  const pending = createMemo(() => props.pending ?? (props.status === "streaming" || props.status === "running"));
  const view = createMemo(() =>
    disclosureView({
      stored: storedOpen(),
      open: props.open,
      forceOpen: props.forceOpen,
      hasContent: props.hasContent,
      hasChildren: Boolean(props.children),
      locked: props.locked,
      pending: pending(),
      allowOpenWhilePending: props.allowOpenWhilePending,
    }),
  );
  const open = () => view().open;
  const expandable = () => view().expandable;
  const canToggle = () => view().canToggle;
  // A mounted body keeps its diff scroll, image state and disclosure children
  // alive when the row collapses, as the reference Collapsible does.
  const [mounted, setMounted] = createSignal(open());

  createEffect(() => {
    if (open()) setMounted(true);
  });

  const toggle = () => {
    if (!canToggle()) return;
    const next = !open();
    setStoredOpen(next);
    props.onOpenChange?.(next);
  };

  const interactiveButton = () => !props.locked && Boolean(props.clickable || expandable());

  const trigger = (
    <div
      data-slot="collapsible-trigger"
      data-locked={props.locked ? "true" : undefined}
      data-hide-details={props.hideDetails ? "true" : undefined}
      aria-expanded={expandable() ? open() : undefined}
      aria-label={props.ariaLabel}
      role={interactiveButton() ? "button" : undefined}
      tabIndex={interactiveButton() ? 0 : undefined}
      onClick={() => {
        if (props.locked) return;
        (props.onTriggerClick ?? toggle)();
      }}
      onKeyDown={(event) => {
        if (props.locked) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        if (!expandable()) {
          if (!props.onTriggerClick) return;
          event.preventDefault();
          props.onTriggerClick();
          return;
        }
        event.preventDefault();
        toggle();
      }}
    >
      <div data-component="tool-trigger" data-clickable={props.clickable ? "true" : undefined}>
        <div data-slot="basic-tool-tool-trigger-content">
          <div data-slot="basic-tool-tool-info">
            {props.trigger ? (
              typeof props.trigger === "function" ? props.trigger(open()) : props.trigger
            ) : (
              <div data-slot="basic-tool-tool-info-structured">
                <div data-slot="basic-tool-tool-info-main">
                  {props.titleNode ?? (
                    <span data-slot="basic-tool-tool-title">
                      <TextShimmer text={props.title ?? ""} active={pending()} />
                    </span>
                  )}
                  {props.subtitleNode ? (
                    <Show when={!(props.hideSubtitleWhenOpen && open())}>{props.subtitleNode}</Show>
                  ) : (
                    <Show when={props.subtitle && !(props.hideSubtitleWhenOpen && open())}>
                      <span
                        data-slot="basic-tool-tool-subtitle"
                        class={cn(props.subtitleClass, props.onSubtitleClick && "clickable")}
                        onClick={(event) => {
                          if (!props.onSubtitleClick) return;
                          event.stopPropagation();
                          props.onSubtitleClick();
                        }}
                      >
                        {props.subtitle}
                      </span>
                    </Show>
                  )}
                  <For each={props.args ?? []}>
                    {(arg) => <span data-slot="basic-tool-tool-arg">{arg}</span>}
                  </For>
                  {props.trailing}
                </div>
              </div>
            )}
          </div>
        </div>
        <Show when={expandable() && !props.hideDetails && !props.locked}>
          <ToolArrow />
        </Show>
      </div>
    </div>
  );

  return (
    <div
      data-component="collapsible"
      data-status={props.status}
      data-compact={props.compact ? "true" : undefined}
      data-rail={props.rail === false ? "false" : undefined}
      data-has-action={props.action ? "true" : undefined}
      data-locked={props.locked ? "true" : undefined}
      class="tool-collapsible"
    >
      <Show when={props.triggerAsLink} fallback={trigger}>
        {(href) => (
          <a
            data-slot="collapsible-trigger"
            href={href()}
            onClick={(event) => {
              if (!props.onTriggerClick) return;
              event.preventDefault();
              props.onTriggerClick();
            }}
          >
            {trigger}
          </a>
        )}
      </Show>
      <Show when={props.action}>
        <span data-slot="basic-tool-action">{props.action}</span>
      </Show>
      <Show when={expandable() && !props.hideDetails && mounted()}>
        <div data-slot="collapsible-content" data-expanded={open() ? "true" : undefined} hidden={!open()}>
          {props.children}
        </div>
      </Show>
    </div>
  );
}

function AnimatedNumber(props: { value: number }) {
  const [shown, setShown] = createSignal(props.value);
  let from = props.value;

  createEffect(() => {
    const target = props.value;
    const start = performance.now();
    const initial = from;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 180);
      setShown(Math.round(initial + (target - initial) * progress));
      if (progress < 1) frame = requestAnimationFrame(step);
      else from = target;
    };
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(step);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return <span data-slot="context-tool-group-count">{shown()}</span>;
}

interface DiffRow {
  kind: "add" | "remove" | "context" | "hunk";
  old?: number;
  next?: number;
  text: string;
}

interface FileDiff {
  /** Stable identity of one change row; the same path can change several times. */
  id: string;
  path: string;
  patch: string;
  added: number;
  removed: number;
  status: "added" | "deleted" | "modified";
  rows: DiffRow[];
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// A patch is parsed once per distinct text: the transcript re-renders on every
// streamed token, and re-scanning an unchanged diff on each of them is pure
// waste. The cache is small and bounded, so a long session cannot grow it.
const DIFF_CACHE_LIMIT = 64;
const diffCache = new Map<string, FileDiff[]>();

function parseDiff(diff: string): FileDiff[] {
  const cached = diffCache.get(diff);
  if (cached) {
    // Refresh recency so a hot patch is not evicted by newer one-off patches.
    diffCache.delete(diff);
    diffCache.set(diff, cached);
    return cached;
  }
  const files = parseDiffUncached(diff);
  diffCache.set(diff, files);
  if (diffCache.size > DIFF_CACHE_LIMIT) {
    const oldest = diffCache.keys().next().value;
    if (oldest !== undefined) diffCache.delete(oldest);
  }
  return files;
}

function parseDiffUncached(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | undefined;
  let oldLine = 0;
  let newLine = 0;
  let pendingPath = "";
  let pendingAdded = false;

  for (const line of diff.split("\n")) {
    if (line.startsWith("--- ")) {
      const raw = line.slice(4).replace(/^a\//, "").trim();
      pendingAdded = raw === "/dev/null";
      pendingPath = pendingAdded ? pendingPath : raw;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).replace(/^b\//, "").trim();
      const path = raw === "/dev/null" ? pendingPath : raw;
      current = {
        id: "",
        path,
        patch: diff,
        added: 0,
        removed: 0,
        status: raw === "/dev/null" ? "deleted" : pendingAdded ? "added" : "modified",
        rows: [],
      };
      files.push(current);
      pendingAdded = false;
      pendingPath = "";
      continue;
    }
    if (!current || line.startsWith("\\ No newline")) continue;

    const hunk = line.match(HUNK);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      current.rows.push({ kind: "hunk", text: line });
      continue;
    }

    if (line.startsWith("+")) {
      current.added += 1;
      current.rows.push({ kind: "add", next: newLine++, text: line.slice(1) });
      continue;
    }
    if (line.startsWith("-")) {
      current.removed += 1;
      current.rows.push({ kind: "remove", old: oldLine++, text: line.slice(1) });
      continue;
    }
    current.rows.push({ kind: "context", old: oldLine++, next: newLine++, text: line.slice(1) });
  }

  return files;
}

function metadataFiles(tool: ToolRun): FileDiff[] {
  const value = tool.metadata?.files;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as {
      file?: unknown;
      path?: unknown;
      patch?: unknown;
      additions?: unknown;
      deletions?: unknown;
      status?: unknown;
    };
    const path = typeof item.file === "string" ? item.file : typeof item.path === "string" ? item.path : "";
    if (!path) return [];
    const id = `${tool.id}:${index}`;
    const patch = typeof item.patch === "string" ? item.patch : "";
    const parsed = patch ? parseDiff(patch) : [];
    if (parsed.length > 0) {
      return parsed.map((file, fileIndex) => ({ ...file, id: `${id}:${fileIndex}` }));
    }
    return [
      {
        id,
        path,
        patch,
        added: typeof item.additions === "number" ? item.additions : 0,
        removed: typeof item.deletions === "number" ? item.deletions : 0,
        status: item.status === "added" || item.status === "deleted" ? item.status : "modified",
        rows: [],
      } satisfies FileDiff,
    ];
  });
}

function filesOf(tools: ToolRun[]): FileDiff[] {
  return tools.flatMap((tool) => {
    const fromMetadata = metadataFiles(tool);
    if (fromMetadata.length > 0) return fromMetadata;
    const parsed = parseDiff(tool.diff ?? "");
    if (parsed.length > 0) {
      return parsed.map((file, index) => ({ ...file, id: `${tool.id}:${index}` }));
    }

    const args = parseArgs(tool.arguments);
    const path = stringArg(args, "path");
    if (!path) return [];
    const id = `${tool.id}:0`;

    // A live edit has no result diff yet; its own arguments already describe
    // the change, so the file row previews it instead of staying empty.
    const before = stringArg(args, "oldString");
    const after = stringArg(args, "newString");
    const content = stringArg(args, "content");
    const patch =
      tool.name === "edit" && (before || after)
        ? createTwoFilesPatch(path, path, before, after)
        : tool.name === "write" && content
          ? createTwoFilesPatch(path, path, "", content)
          : "";
    if (!patch) return [{ id, path, patch: "", added: 0, removed: 0, status: "modified" as const, rows: [] }];

    const preview = parseDiff(patch);
    return preview.length > 0
      ? preview.map((file, index) => ({ ...file, id: `${tool.id}:${index}` }))
      : [{ id, path, patch, added: 0, removed: 0, status: "modified" as const, rows: [] }];
  });
}

/**
 * One diff or source line. Tokenizing is the expensive part of a diff row and
 * a line's text never changes, so the output is memoized on its two props;
 * without that, scrolling a long patch re-tokenizes every mounted line.
 */
function SyntaxText(props: { text: string; language: string }) {
  return (
    <For each={tokenize(props.text, props.language)}>
      {(token) =>
        token.kind ? (
          <span class={`tok-${token.kind}`}>{token.text}</span>
        ) : (
          <span>{token.text}</span>
        )
      }
    </For>
  );
}

/**
 * A source block with one shared number gutter. Code and output sit in
 * sections of the same width, so their content starts on the same column.
 */
function NumberedSource(props: { text: string; language: string; digits: number; slot: string }) {
  const lines = () => props.text.split("\n");
  return (
    <pre data-slot={props.slot} data-numbered="true">
      <code>
        <For each={lines()}>
          {(line, index) => (
            <span data-slot="source-line">
              <span data-slot="source-number" style={{ width: `${props.digits}ch` }}>
                {index() + 1}
              </span>
              <span data-slot="source-text">
                <SyntaxText text={line || " "} language={props.language} />
              </span>
            </span>
          )}
        </For>
      </code>
    </pre>
  );
}

function DiffLine(props: { row: DiffRow; language: string }) {
  return (
    <Show
      when={props.row.kind !== "hunk"}
      fallback={
        <div data-slot="diff-hunk">
          <span class="w-10 shrink-0" />
          <span class="w-3 shrink-0" />
          <span class="whitespace-pre">{props.row.text}</span>
        </div>
      }
    >
      <div data-slot="diff-line" data-kind={props.row.kind}>
        <span class="w-10 shrink-0 text-right tabular-nums select-none">
          {props.row.kind === "add" ? props.row.next : (props.row.old ?? "")}
        </span>
        <span class="diff-marker">
          <Show when={props.row.kind === "add"}>
            <span data-kind="add" />
          </Show>
          <Show when={props.row.kind === "remove"}>
            <span data-kind="remove" />
          </Show>
        </span>
        <span class="min-w-0 flex-1 select-text">
          <SyntaxText text={props.row.text || " "} language={props.language} />
        </span>
      </div>
    </Show>
  );
}

const DIFF_LINE_HEIGHT = 24;
const DIFF_VIEWPORT = 320;
const DIFF_WINDOW = 200;

/** Long diffs render a fixed 24px window so a large patch stays cheap to mount. */
function FileDiffRows(props: { file: FileDiff }) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const language = () => languageOf(props.file.path);
  const pierre = () => diffAvailable() && Boolean(props.file.patch);

  if (props.file.rows.length === 0) return null;

  if (pierre()) return <PierreDiff path={props.file.path} patch={props.file.patch} />;

  if (props.file.rows.length <= DIFF_WINDOW) {
    return (
      <div data-slot="diff-scroll">
        <For each={props.file.rows}>
          {(row) => <DiffLine row={row} language={language()} />}
        </For>
      </div>
    );
  }

  const total = props.file.rows.length * DIFF_LINE_HEIGHT;
  const start = () => Math.max(0, Math.floor(scrollTop() / DIFF_LINE_HEIGHT) - 8);
  const visible = Math.ceil(DIFF_VIEWPORT / DIFF_LINE_HEIGHT) + 16;
  const end = () => Math.min(props.file.rows.length, start() + visible);

  return (
    <div
      data-slot="diff-scroll"
      data-virtualized="true"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: `${total}px`, position: "relative" }}>
        <div style={{ position: "absolute", "inset-inline": 0, top: `${start() * DIFF_LINE_HEIGHT}px` }}>
          <For each={props.file.rows.slice(start(), end())}>
            {(row) => <DiffLine row={row} language={language()} />}
          </For>
        </div>
      </div>
    </div>
  );
}

function FileRow(props: { file: FileDiff; groupKey: string; detail: TimelineDetail; first: boolean }) {
  const path = () => splitPath(props.file.path);
  const expandable = () => props.file.rows.length > 0;
  // Each change row keys its own slice. Keying by path alone made every row for
  // the same file share one disclosure, so opening one expanded them all.
  const [open, setOpen] = useDisclosure(`${props.groupKey}:file:${props.file.id}`, props.detail.edit.details === "expanded");

  return (
    <div
      data-slot="accordion-item"
      data-type={props.file.status}
      data-expanded={open() ? "" : undefined}
      data-closed={!open() ? "" : undefined}
      data-first={props.first ? "true" : undefined}
    >
      <h3
        data-slot="accordion-header"
        data-component="sticky-accordion-header"
        data-expanded={open() ? "" : undefined}
        data-closed={!open() ? "" : undefined}
      >
        <button
          type="button"
          data-slot="accordion-trigger"
          data-expanded={open() ? "" : undefined}
          data-closed={!open() ? "" : undefined}
          aria-expanded={expandable() ? open() : undefined}
          onClick={() => expandable() && setOpen(!open())}
          class={cn(!expandable() && "cursor-default")}
        >
          <span data-slot="apply-patch-trigger-content">
            <span data-slot="apply-patch-file-info">
              <FileTypeIcon path={props.file.path} />
              <span data-slot="apply-patch-file-name-container">
                <Show when={path().directory}>
                  <span data-slot="apply-patch-directory">{path().directory}</span>
                </Show>
                <span data-slot="apply-patch-filename">{path().name}</span>
              </span>
            </span>
            <span data-slot="apply-patch-trigger-actions">
              <Show
                when={props.file.status === "added"}
                fallback={
                  <Show
                    when={props.file.status === "deleted"}
                    fallback={
                      <span data-component="diff-changes" data-appearance="standard">
                        <span data-slot="diff-changes-additions">+{props.file.added}</span>
                        <span data-slot="diff-changes-deletions">-{props.file.removed}</span>
                      </span>
                    }
                  >
                    <span data-slot="apply-patch-change" data-type="removed">
                      Deleted
                    </span>
                  </Show>
                }
              >
                <span data-slot="apply-patch-change" data-type="added">
                  Created
                </span>
              </Show>
              <ChevronsUpDown class="size-3.5 text-text-faint" />
            </span>
          </span>
        </button>
      </h3>
      <Show when={expandable() && open()}>
        <div data-slot="accordion-content" data-expanded="">
          <div data-component="apply-patch-file-diff">
            <FileDiffRows file={props.file} />
          </div>
        </div>
      </Show>
    </div>
  );
}

interface Diagnostic {
  severity?: string | number;
  message?: string;
  line?: number;
  column?: number;
  range?: { start?: { line?: number; character?: number } };
}

function diagnosticOf(value: unknown): Diagnostic | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Diagnostic;
  const severity = item.severity;
  if (severity !== undefined && severity !== "error" && severity !== 1) return undefined;
  const start = item.range?.start;
  return {
    ...item,
    line: item.line ?? (typeof start?.line === "number" ? start.line + 1 : undefined),
    column: item.column ?? (typeof start?.character === "number" ? start.character + 1 : undefined),
  };
}

function diagnosticsOf(tools: ToolRun[]): Diagnostic[] {
  return tools
    .flatMap((tool) => {
      const value = tool.metadata?.diagnostics;
      if (Array.isArray(value)) {
        return value.flatMap((item) => {
          const diagnostic = diagnosticOf(item);
          return diagnostic ? [diagnostic] : [];
        });
      }
      if (!value || typeof value !== "object") return [];
      return Object.values(value).flatMap((items) =>
        Array.isArray(items)
          ? items.flatMap((item) => {
              const diagnostic = diagnosticOf(item);
              return diagnostic ? [diagnostic] : [];
            })
          : [],
      );
    })
    .slice(0, 3);
}

export function FileGroup(props: {
  tools: ToolRun[];
  detail: TimelineDetailInput;
  groupKey: string;
  showHeader?: boolean;
  /** Show only the first N files; the summary controls the Show all affordance. */
  limit?: number;
}) {
  const tr = useT();
  const detail = createMemo(() => timelineDetail(props.detail));
  // `filesOf` parses patches and builds preview diffs; it only needs to run when
  // the tools themselves change, not on every parent render.
  const files = createMemo(() => filesOf(props.tools));
  const shown = createMemo(() => (props.limit === undefined ? files() : files().slice(0, props.limit)));
  const diagnostics = createMemo(() => diagnosticsOf(props.tools));

  const first = () => props.tools[0];
  const name = () => (first()?.name === "edit" || first()?.name === "write" ? first()!.name : "patch");
  const title = () => toolName(name());
  const component = () =>
    name() === "edit" ? "edit-tool" : name() === "write" ? "write-tool" : "apply-patch-tool";
  const header = () => props.showHeader || (files().length === 0 && name() !== "write");

  return (
    <div data-component={component()} data-header={header() ? "" : undefined}>
      <div data-component="collapsible" data-rail={header() ? undefined : "false"} class="tool-collapsible">
        <Show when={header()}>
          <div data-slot="collapsible-trigger" data-locked="true" aria-expanded="true">
            <div data-component="tool-trigger">
              <div data-slot="basic-tool-tool-trigger-content">
                <div data-slot="basic-tool-tool-info">
                  <div data-slot="basic-tool-tool-info-structured">
                    <div data-slot="basic-tool-tool-info-main">
                      <span data-slot="basic-tool-tool-title">{title()}</span>
                      <Show when={files().length > 0}>
                        <span data-slot="basic-tool-tool-subtitle">
                          {tr(files().length === 1 ? "toolFileOne" : "toolFilesMany", { count: files().length })}
                        </span>
                      </Show>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Show>
        <div data-slot="collapsible-content" data-expanded="true">
          <Show when={files().length > 0}>
            <div
              data-component="accordion"
              data-scope="apply-patch"
              onKeyDown={(event) => {
                if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                if (!(event.target instanceof HTMLButtonElement) || event.target.dataset.slot !== "accordion-trigger") return;

                const triggers = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    ':scope > [data-slot="accordion-item"] > [data-slot="accordion-header"] > [data-slot="accordion-trigger"]',
                  ),
                ];
                const index = triggers.indexOf(event.target);
                if (index < 0) return;
                event.preventDefault();

                if (event.key === "Home") return triggers[0]?.focus();
                if (event.key === "End") return triggers[triggers.length - 1]?.focus();
                triggers[(index + (event.key === "ArrowDown" ? 1 : -1) + triggers.length) % triggers.length]?.focus();
              }}
            >
              <For each={shown()}>
                {(file, index) => (
                  <FileRow file={file} groupKey={props.groupKey} detail={detail()} first={index() === 0} />
                )}
              </For>
            </div>
          </Show>
          <Show when={diagnostics().length > 0}>
            <div data-component="diagnostics">
              <For each={diagnostics()}>
                {(item) => (
                  <div data-slot="diagnostic">
                    <span data-slot="diagnostic-label">{tr("toolErrorLabel")}</span>
                    <span data-slot="diagnostic-location">
                      [{item.line ?? 1}:{item.column ?? 1}]
                    </span>
                    <span data-slot="diagnostic-message">{item.message ?? ""}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

export function ReadGroup(props: { tools: ToolRun[]; groupKey?: string }) {
  const tr = useT();
  const [expanded, setExpanded] = useDisclosure(`read:${props.groupKey ?? props.tools[0]?.id ?? "group"}`);
  const [truncated, setTruncated] = createSignal(false);
  let list: HTMLSpanElement | undefined;
  const files = createMemo(() =>
    props.tools.map((tool) => {
      const args = parseArgs(tool.arguments);
      return { id: tool.id, name: splitPath(stringArg(args, "path")).name, args: readArgs(args) };
    }),
  );
  const signature = createMemo(() => files().map((file) => `${file.id}:${file.name}:${file.args.join(",")}`).join("|"));

  createEffect(() => {
    const isExpanded = expanded();
    signature();
    const element = list;
    if (!element || isExpanded) return;
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  const expandable = () => expanded() || truncated();

  return (
    <div
      data-component="read-tool-group"
      data-timeline-part-ids={props.tools.map((tool) => tool.id).join(",")}
      data-expanded={expanded() ? "true" : undefined}
      role={expandable() ? "button" : undefined}
      tabIndex={expandable() ? 0 : undefined}
      aria-expanded={expandable() ? expanded() : undefined}
      onClick={() => expandable() && setExpanded(!expanded())}
      onKeyDown={(event) => {
        if (!expandable()) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setExpanded(!expanded());
      }}
    >
      <div data-component="tool-trigger">
        <div data-slot="basic-tool-tool-trigger-content">
          <div data-slot="basic-tool-tool-info">
            <div data-slot="basic-tool-tool-info-structured">
              <div data-slot="basic-tool-tool-info-main">
                <span data-slot="basic-tool-tool-title">
                  <TextShimmer text={tr("toolRead")} active={props.tools.some((tool) => !tool.done)} />
                </span>
                <span ref={(el) => (list = el)} data-slot="basic-tool-tool-subtitle">
                  <For each={files()}>
                    {(file, index) => (
                      <span data-slot="read-tool-group-file">
                        {file.name}
                        <For each={file.args}>
                          {(arg) => <span data-slot="basic-tool-tool-arg">{arg}</span>}
                        </For>
                        {index() < files().length - 1 && ", "}
                      </span>
                    )}
                  </For>
                </span>
              </div>
            </div>
          </div>
        </div>
        <Show when={expandable()}>
          <span data-slot="read-tool-group-arrow" aria-hidden="true">
            <TriangleDown class="size-4 text-text-faint" />
          </span>
        </Show>
      </div>
    </div>
  );
}

function SkillGroup(props: { tools: ToolRun[] }) {
  const tr = useT();
  const names = () => unique(props.tools.map((tool) => skillName(tool) || "skill"));
  const running = () => props.tools.some((tool) => !tool.done);
  const kind = () => tr(names().length === 1 ? "toolSkillKind" : "toolSkillKindPlural");
  const label = () => `${names().join(", ")} ${kind()}`;

  return (
    <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${label()}`}>
      <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
      <span data-slot="tool-loaded-value">
        <TextShimmer text={names().join(", ")} active={running()} />
      </span>
      <span data-slot="tool-loaded-kind">{kind()}</span>
    </div>
  );
}

function skillName(tool: ToolRun): string {
  const metadata = tool.metadata?.name;
  if (typeof metadata === "string" && metadata) return metadata;
  const args = parseArgs(tool.arguments);
  return stringArg(args, "id") || stringArg(args, "name");
}

function ToolErrorCard(props: {
  tool: string;
  error: string;
  subtitle?: string;
  title?: string;
  id: string;
  onSubtitleClick?: () => void;
}) {
  const tr = useT();
  const [open, setOpen] = useDisclosure(`error:${props.id}`);
  const [clipped, setClipped] = createSignal(false);
  let subtitleRef: HTMLSpanElement | undefined;
  const cleaned = () => props.error.replace(/^Error:\s*/, "").trim();
  const tail = () => {
    const text = cleaned();
    return text.startsWith(`${props.tool} `) ? text.slice(props.tool.length + 1) : text;
  };
  const summary = () => {
    const head = (tail().split(": ")[0] ?? "").trim();
    return head ? capitalize(head) : tr("toolFailed");
  };
  const name = () => props.title ?? toolName(props.tool);

  createEffect(() => {
    const isOpen = open();
    void props.subtitle;
    if (isOpen) return;
    const element = subtitleRef;
    if (!element) return;
    setClipped((element.textContent ?? "").includes("\n") || element.scrollWidth > element.clientWidth);
  });

  return (
    <div data-component="card" data-kind="tool-error-card" data-tool={props.tool} data-open={open() ? "true" : "false"}>
      <div data-component="collapsible" data-open={open() ? "true" : "false"} class="tool-collapsible">
        <div
          data-slot="collapsible-trigger"
          role="button"
          tabIndex={0}
          aria-expanded={open()}
          onClick={() => setOpen(!open())}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setOpen(!open());
          }}
        >
          <div data-component="tool-trigger">
            <div data-slot="basic-tool-tool-trigger-content">
              <span data-slot="basic-tool-tool-indicator" data-component="tool-error-card-icon">
                <TriangleAlert class="size-4 text-state-fg-danger" />
              </span>
              <div data-slot="basic-tool-tool-info">
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <span data-slot="basic-tool-tool-title">{name()}</span>
                    <Show when={props.subtitle && !(open() && clipped())}>
                      <span
                        ref={(el) => (subtitleRef = el)}
                        data-slot="basic-tool-tool-subtitle"
                        class={cn(props.onSubtitleClick && "clickable subagent-link")}
                        onClick={(event) => {
                          if (!props.onSubtitleClick) return;
                          event.stopPropagation();
                          props.onSubtitleClick();
                        }}
                      >
                        {props.subtitle}
                      </span>
                    </Show>
                    <Show when={!open()}>
                      <span data-slot="tool-error-card-summary">{summary()}</span>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
            <ToolArrow />
          </div>
        </div>
        <Show when={open()}>
          <div data-slot="collapsible-content" data-expanded="true">
            <div data-slot="tool-error-card-content">
              <span data-slot="tool-error-card-copy">
                <CopyButton text={cleaned()} label={tr("toolCopyError")} />
              </span>
              <Show when={clipped() && props.subtitle}>
                <p data-slot="tool-error-card-subtitle">{props.subtitle}</p>
              </Show>
              <p data-slot="card-description">{cleaned() || tr("toolNoErrorOutput")}</p>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

function ShellConsoleCopy(props: { text: string; label: string }) {
  return (
    <div data-slot="bash-copy">
      <CopyButton text={props.text} label={props.label} iconClass="size-4" />
    </div>
  );
}

function ConsoleOutput(props: { command?: string; output: string; truncated?: boolean }) {
  const tr = useT();
  return (
    <div data-component="bash-output" data-variant="shell" dir="ltr">
      <div
        data-slot="bash-scroll"
        data-scrollable
        tabIndex={0}
        role="region"
        aria-label={tr("scrollableContent")}
      >
        <Show when={props.command}>
          <div data-slot="bash-command">
            <ShellConsoleCopy text={props.command!} label={tr("copyAction")} />
            <pre data-slot="bash-pre">
              <code>{props.command}</code>
            </pre>
          </div>
        </Show>
        <Show when={props.output}>
          <div data-slot="bash-result">
            <ShellConsoleCopy text={props.output} label={tr("toolExecuteCopyOutput")} />
            <pre data-slot="bash-pre">
              <code>
                <LinkedText text={props.output} />
              </code>
            </pre>
          </div>
        </Show>
      </div>
      <Show when={props.truncated}>
        <div data-slot="bash-truncated">{tr("toolOutputTruncated")}</div>
      </Show>
    </div>
  );
}

function ShellSubmessage(props: { text: string; animate?: boolean }) {
  return (
    <span data-component="shell-submessage" dir="ltr">
      <span data-slot="shell-submessage-width">
        <span data-slot="basic-tool-tool-subtitle">
          <span data-slot="shell-submessage-value" class={cn(props.animate && "shell-submessage-in")}>
            {props.text}
          </span>
        </span>
      </span>
    </span>
  );
}

function ShellTrigger(props: { value: string; pending: boolean; open: boolean; title?: string }) {
  const tr = useT();
  return (
    <div data-slot="basic-tool-tool-info-structured">
      <div data-slot="basic-tool-tool-info-main">
        <span data-slot="basic-tool-tool-title">
          <TextShimmer text={props.title ?? tr("toolShell")} active={props.pending} />
        </span>
        <Show when={!props.open}>
          <Show
            when={props.value}
            fallback={
              <Show when={props.pending}>
                <span data-slot="basic-tool-tool-subtitle">{tr("toolWritingCommand")}</span>
              </Show>
            }
          >
            <ShellSubmessage text={props.value} animate={props.pending} />
          </Show>
        </Show>
      </div>
    </div>
  );
}

/** Reads one page of a background shell's captured output. */
export interface ShellOutputSource {
  id: string;
  running: boolean;
  load: (id: string, cursor: number) => Promise<{ output: string; cursor: number; truncated?: boolean }>;
}

/** Polls a running background job's output until it settles. */
function useShellOutput(source: Accessor<ShellOutputSource | undefined>) {
  const [streamed, setStreamed] = createSignal<{ output: string; truncated: boolean }>();
  let cursor = 0;

  createEffect(() => {
    const current = source();
    const id = current?.id;
    const running = current?.running;
    if (!current) {
      setStreamed(undefined);
      cursor = 0;
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const page = await current.load(id!, cursor);
        if (cancelled) return;
        cursor = page.cursor;
        setStreamed((value) => ({
          output: `${value?.output ?? ""}${page.output}`,
          truncated: Boolean(value?.truncated || page.truncated),
        }));
      } catch {
        // A missing job keeps the static snapshot; the activity pill reports it.
      }
      if (!cancelled && running) timer = window.setTimeout(poll, 700);
    };

    void poll();
    onCleanup(() => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    });
  });

  return streamed;
}

function ShellTool(props: {
  tool?: ToolRun;
  command?: string;
  defaultOpen?: boolean;
  title?: string;
  /** Streams a background job's captured output instead of a static snapshot. */
  shellOutput?: ShellOutputSource;
}) {
  const args = createMemo(() => (props.tool ? parseArgs(props.tool.arguments) : {}));
  const value = createMemo(() => props.command ?? (stringArg(args(), "command") || stringArg(args(), "code")));
  const streamed = useShellOutput(() => props.shellOutput);
  const output = createMemo(() => streamed()?.output ?? stripAnsi(props.tool?.output ?? ""));
  const pending = createMemo(() => (props.tool ? !props.tool.done : false));

  return (
    <BasicTool
      id={`shell:${props.tool?.id ?? value()}`}
      status={pending() ? "running" : "completed"}
      allowOpenWhilePending
      compact
      rail={false}
      hasContent
      defaultOpen={props.defaultOpen}
      trigger={(open) => <ShellTrigger value={value()} pending={pending()} open={open} title={props.title} />}
    >
      <ConsoleOutput
        command={value()}
        output={output()}
        truncated={streamed()?.truncated || props.tool?.metadata?.truncated === true}
      />
    </BasicTool>
  );
}

export function SessionShellMessage(props: {
  shell: ShellRun;
  entryKey: string;
  detail?: TimelineDetailInput;
}) {
  const tr = useT();
  const pending = () => props.shell.running === true;
  const detail = createMemo(() => timelineDetail(props.detail));
  const error = () => {
    if (props.shell.timedOut) return tr("toolCommandTimedOut");
    if (!pending() && props.shell.exit !== 0) return tr("toolCommandExited", { code: props.shell.exit ?? 0 });
    return "";
  };

  return (
    <div data-component="session-shell-message" data-timeline-part-id={props.entryKey}>
      <BasicTool
        id={`shell-message:${props.entryKey}`}
        status={pending() ? "running" : "completed"}
        allowOpenWhilePending
        compact
        rail={false}
        hasContent
        defaultOpen={detail().shell.details === "expanded"}
        trigger={(open) => <ShellTrigger value={props.shell.command ?? ""} pending={pending()} open={open} />}
      >
        <ConsoleOutput
          command={props.shell.command ?? ""}
          output={stripAnsi(props.shell.output ?? "")}
          truncated={props.shell.truncated}
        />
      </BasicTool>
      <Show when={error()}>
        {(message) => (
          <ToolErrorCard
            tool="shell"
            error={message()}
            subtitle={props.shell.command ?? ""}
            id={`shell-error:${props.entryKey}`}
          />
        )}
      </Show>
    </div>
  );
}

function readImage(tool: ToolRun): EntryAttachment | undefined {
  return tool.attachments?.find((attachment) => attachment.mime.startsWith("image/") && attachment.data);
}

function loadedPaths(tool: ToolRun): string[] {
  const loaded = tool.metadata?.loaded;
  return Array.isArray(loaded) ? loaded.filter((path): path is string => typeof path === "string") : [];
}

function relativePath(path: string, workspace?: string): string {
  if (!workspace) return path;
  const root = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalized = path.replace(/\\/g, "/");
  if (!root || normalized === root) return normalized;
  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : path;
}

function ReadTool(props: { tool: ToolRun; workspace?: string }) {
  const tr = useT();
  const args = () => parseArgs(props.tool.arguments);
  const path = () => stringArg(args(), "path");
  const image = () => (props.tool.done ? readImage(props.tool) : undefined);
  const loaded = () => loadedPaths(props.tool).map((value) => relativePath(value, props.workspace));

  return (
    <>
      <BasicTool
        id={`read:${props.tool.id}`}
        title={tr("toolRead")}
        subtitle={splitPath(path()).name}
        args={readArgs(args())}
        pending={!props.tool.done}
        hasContent={Boolean(image())}
      >
        <Show when={image()}>
          {(attachment) => (
            <div data-component="read-image">
              <img
                src={`data:${attachment().mime};base64,${attachment().data}`}
                alt={attachment().name ?? splitPath(path()).name}
              />
            </div>
          )}
        </Show>
      </BasicTool>
      <Show when={loaded().length > 0}>
        <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${loaded().join(", ")}`}>
          <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
          <span data-slot="tool-loaded-value">{loaded().join(", ")}</span>
        </div>
      </Show>
    </>
  );
}

function ListTool(props: { tool: ToolRun; summaryOnly?: boolean }) {
  const tr = useT();
  const args = () => parseArgs(props.tool.arguments);
  const title = () => tr("toolList");
  const subtitle = () => displayDirectory(stringArg(args(), "path"));
  const output = () => props.tool.output ?? "";

  return (
    <Switch fallback={
      <BasicTool
        id={`list:${props.tool.id}`}
        title={title()}
        subtitle={subtitle()}
        pending={!props.tool.done}
        hasContent={Boolean(output())}
      >
        <Show when={output()}>
          <ToolOutput text={output()} />
        </Show>
      </BasicTool>
    }>
      <Match when={props.summaryOnly}>
        <SearchSummary tool={props.tool} title={title()} subtitle={subtitle()} />
      </Match>
    </Switch>
  );
}

/**
 * A search shows what was searched, never the raw list it returned, matching
 * the reference timeline. The match count stays on the row so the result is
 * still legible at a glance.
 */
function SearchTool(props: { tool: ToolRun; summaryOnly?: boolean }) {
  const tr = useT();
  const args = () => parseArgs(props.tool.arguments);
  const count = () => (props.tool.done ? matchCount(props.tool, props.tool.output ?? "") : undefined);
  const title = () => (props.tool.name === "glob" ? tr("toolGlob") : tr("toolGrep"));
  const subtitle = () => displayDirectory(stringArg(args(), "path"));
  const searchArgs = () => toolArgs(props.tool, args());
  const output = () => props.tool.output ?? "";

  return (
    <Switch
      fallback={
        <BasicTool
          id={`${props.tool.name}:${props.tool.id}`}
          title={title()}
          subtitle={subtitle()}
          args={searchArgs()}
          pending={!props.tool.done}
          hasContent={Boolean(output())}
        >
          <Show when={output()}>
            <ToolOutput text={output()} />
          </Show>
        </BasicTool>
      }
    >
      <Match when={props.summaryOnly}>
        <SearchSummary
          tool={props.tool}
          title={title()}
          subtitle={subtitle()}
          args={searchArgs()}
          trailing={
            <Show when={count()}>
              {(matches) => (
                <span data-slot="context-tool-group-matches">
                  {tr(matches() === 1 ? "toolMatchOne" : "toolMatchesMany", { count: matches() })}
                </span>
              )}
            </Show>
          }
        />
      </Match>
    </Switch>
  );
}

/** Raw search output, scrollable and capped like the reference tool row. */
function ToolOutput(props: { text: string }) {
  const tr = useT();
  return (
    <div
      data-component="tool-output"
      data-scrollable
      tabIndex={0}
      role="region"
      aria-label={tr("scrollableContent")}
    >
      <Markdown text={props.text} />
    </div>
  );
}

function SearchSummary(props: {
  tool: ToolRun;
  title: string;
  subtitle: string;
  args?: string[];
  trailing?: JSX.Element;
}) {
  return (
    <div data-component="tool-trigger">
      <div data-slot="basic-tool-tool-trigger-content">
        <div data-slot="basic-tool-tool-info">
          <div data-slot="basic-tool-tool-info-structured">
            <div data-slot="basic-tool-tool-info-main">
              <span data-slot="basic-tool-tool-title">
                <TextShimmer text={props.title} active={!props.tool.done} />
              </span>
              <span data-slot="basic-tool-tool-subtitle">{props.subtitle}</span>
              <For each={props.args ?? []}>
                {(arg) => <span data-slot="basic-tool-tool-arg">{arg}</span>}
              </For>
            </div>
            <Show when={props.trailing}>
              <span data-slot="context-tool-group-dot" />
              {props.trailing}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

function WebfetchTool(props: { tool: ToolRun }) {
  const tr = useT();
  const url = () => stringArg(parseArgs(props.tool.arguments), "url");
  return (
    <BasicTool
      id={`webfetch:${props.tool.id}`}
      hideDetails
      trigger={
        <div data-slot="basic-tool-tool-info-structured">
          <div data-slot="basic-tool-tool-info-main">
            <span data-slot="basic-tool-tool-title">
              <TextShimmer text={tr("toolWebfetch")} active={!props.tool.done} />
            </span>
            <Show when={url()}>
              <a
                data-slot="basic-tool-tool-subtitle"
                class="webfetch-link"
                href={url()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                <span data-slot="webfetch-link-text">{url()}</span>
                <SquareArrow data-slot="webfetch-link-icon" class="size-4" />
              </a>
            </Show>
          </div>
        </div>
      }
    />
  );
}

function webProviderLabel(tool: ToolRun): string {
  const provider = tool.metadata?.provider;
  if (typeof provider !== "string" || !provider) return t("toolWebsearch");
  const known: Record<string, string> = { brave: "Brave", exa: "Exa", tavily: "Tavily", tinyfish: "TinyFish" };
  return t("toolWebsearchProvider", { provider: known[provider.toLowerCase()] ?? capitalize(provider) });
}

function webUrls(output: string | undefined): string[] {
  if (!output) return [];
  return [
    ...new Set(
      [...output.matchAll(/https?:\/\/[^\s<>"'`)\]]+/g)]
        .map((match) => match[0].replace(/[),.;:!?]+$/g, ""))
        .filter(Boolean),
    ),
  ];
}

function WebsearchTool(props: { tool: ToolRun }) {
  const tr = useT();
  const [showAll, setShowAll] = createSignal(false);
  const query = () => stringArg(parseArgs(props.tool.arguments), "query");
  const title = () => webProviderLabel(props.tool);
  const links = createMemo(() => webUrls(props.tool.output));
  const visible = () => (showAll() ? links() : links().slice(0, 10));
  const remaining = () => Math.max(0, links().length - 10);

  return (
    <BasicTool
      id={`websearch:${props.tool.id}`}
      title={title()}
      subtitle={query()}
      subtitleClass="exa-tool-query"
      pending={!props.tool.done}
      hasContent={links().length > 0}
    >
      <div data-component="exa-tool-output">
        <div data-slot="exa-tool-links">
          <For each={visible()}>
            {(url) => (
              <a
                data-slot="exa-tool-link"
                class="webfetch-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                <span data-slot="webfetch-link-text">{url}</span>
                <SquareArrow data-slot="webfetch-link-icon" class="size-4" />
              </a>
            )}
          </For>
          <Show when={!showAll() && remaining() > 0}>
            <button type="button" data-slot="exa-tool-more" onClick={() => setShowAll(true)}>
              {tr("toolMore", { count: remaining() })}
            </button>
          </Show>
        </div>
      </div>
    </BasicTool>
  );
}

interface ExecuteCall {
  tool?: string;
  status?: string;
  input?: Record<string, unknown>;
  error?: string;
}

function executeField(tool: ToolRun, key: string): unknown {
  return tool.metadata?.[key];
}

function executeCalls(tool: ToolRun): ExecuteCall[] {
  const value = executeField(tool, "toolCalls");
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const call = item as ExecuteCall;
    if (typeof call.tool !== "string" || !["running", "completed", "error"].includes(call.status ?? "")) return [];
    return [
      {
        ...call,
        input:
          call.input && typeof call.input === "object" && !Array.isArray(call.input)
            ? call.input
            : undefined,
      },
    ];
  });
}

function executeArgs(input: Record<string, unknown> | undefined): string[] {
  if (!input) return [];
  return Object.entries(input)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, " ")}`);
}

function executeSubtitle(calls: ExecuteCall[]): string {
  const call = calls.find((item) => item.status === "error") ?? calls[calls.length - 1];
  if (!call?.tool) return "";
  const args = executeArgs(call.input);
  return args.length ? `${call.tool} [${args.join(", ")}]` : call.tool;
}

function ExecuteCallRow(props: { call?: ExecuteCall; error?: string; disclosureKey: string }) {
  const [open, setOpen] = useDisclosure(`execute-call:${props.disclosureKey}`);
  const args = () => executeArgs(props.call?.input);
  const entries = () => Object.entries(props.call?.input ?? {});
  const failed = () => !props.call || props.call.status === "error";
  const expandable = () => entries().length > 0 || Boolean(props.error);
  const summary = () => (props.call ? args().join(", ") : (props.error ?? "").split("\n")[0]);

  const toggle = () => {
    if (!expandable() || window.getSelection()?.toString()) return;
    setOpen(!open());
  };

  return (
    <div data-slot="execute-tool-call-item">
      <div
        data-slot="execute-tool-call"
        data-status={failed() ? "error" : props.call?.status}
        data-expanded={open() ? "true" : undefined}
        dir="ltr"
        role={expandable() ? "button" : undefined}
        tabIndex={expandable() ? 0 : undefined}
        aria-expanded={expandable() ? open() : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (!expandable()) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        }}
      >
        <span data-slot="execute-tool-call-marker">
          <Show when={failed()} fallback={<span data-slot="execute-tool-call-arrow">›</span>}>
            <TriangleAlert class="size-3.5" />
          </Show>
        </span>
        <Show when={props.call?.tool}>
          {(name) => (
            <span data-slot="execute-tool-call-name">
              <TextShimmer text={name()} active={props.call?.status === "running"} />
            </span>
          )}
        </Show>
        <Show when={!open() && summary()}>
          <span data-slot="execute-tool-call-args" title={summary()}>
            {props.call ? `[${summary()}]` : summary()}
          </span>
        </Show>
        <Show when={props.error}>
          <span data-slot="execute-tool-call-arrow">›</span>
        </Show>
      </div>
      <Show when={open()}>
        <>
          <Show when={entries().length > 0}>
            <dl data-slot="execute-tool-call-input" dir="ltr">
              <For each={entries()}>
                {([key, value]) => (
                  <div data-slot="execute-tool-call-input-entry">
                    <dt>{key}:</dt>
                    <dd>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd>
                  </div>
                )}
              </For>
            </dl>
          </Show>
          <Show when={props.error}>
            {(error) => (
              <div data-slot="execute-tool-error" dir="ltr">
                <LinkedText text={error()} />
              </div>
            )}
          </Show>
        </>
      </Show>
    </div>
  );
}

function ExecuteOutputRow(props: { output: string; disclosureKey: string }) {
  const tr = useT();
  const [open, setOpen] = useDisclosure(`execute-output:${props.disclosureKey}`);
  const text = () => formatExecuteOutput(props.output).text;
  const lines = () => executeLines(text());

  const toggle = () => {
    if (window.getSelection()?.toString()) return;
    setOpen(!open());
  };

  return (
    <div data-slot="execute-tool-call-item">
      <div
        data-slot="execute-tool-call"
        data-kind="output"
        role="button"
        tabIndex={0}
        aria-expanded={open()}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        }}
      >
        <span data-slot="execute-tool-call-marker">
          <span data-slot="execute-tool-call-arrow">›</span>
        </span>
        <span data-slot="execute-tool-call-name">{tr("toolExecuteOutput")}</span>
        <span data-slot="execute-tool-call-args">
          {tr(lines() === 1 ? "toolLinesOne" : "toolLinesMany", { count: lines() })}
        </span>
      </div>
      <Show when={open()}>
        <div data-slot="execute-tool-output">
          <ConsoleOutput output={text()} />
        </div>
      </Show>
    </div>
  );
}

function executeLines(text: string) {
  return text.split("\n").length;
}

function ExecuteTool(props: { tool: ToolRun }) {
  const tr = useT();
  const [codeOpen, setCodeOpen] = createSignal(false);
  const calls = createMemo(() => executeCalls(props.tool));
  const pending = () => !props.tool.done;
  const code = () =>
    (typeof executeField(props.tool, "code") === "string"
      ? String(executeField(props.tool, "code"))
      : stringArg(parseArgs(props.tool.arguments), "code")
    ).trimEnd();

  // A runtime failure shows on the failing call row; a successful script shows
  // its result as a collapsible output row.
  const error = () => {
    if (!props.tool.failed && props.tool.metadata?.error !== true) return "";
    const explicit =
      typeof executeField(props.tool, "errorMessage") === "string" ? String(executeField(props.tool, "errorMessage")) : "";
    const text = stripAnsi(explicit || props.tool.output || tr("toolFailed")).replace(/^Error:\s*/, "").trim();
    return text || tr("toolFailed");
  };
  const output = () => {
    if (error()) return "";
    return stripAnsi(
      typeof executeField(props.tool, "output") === "string" ? String(executeField(props.tool, "output")) : props.tool.output ?? "",
    )
      .replace(/\r\n?/g, "\n")
      .trim();
  };
  const formattedOutput = createMemo(() => formatExecuteOutput(output()));
  const outputText = () => formattedOutput().text;
  const owner = () => calls().reduce((found, item, index) => (item.status === "error" ? index : found), -1);
  const subtitle = () => executeSubtitle(calls());
  const viewable = () => !pending() && Boolean(code());
  const status = () => (error() ? tr("toolFailed") : pending() ? tr("toolRunning") : tr("toolCompleted"));
  const callCount = () =>
    calls().length ? tr(calls().length === 1 ? "toolCallsOne" : "toolCallsMany", { count: calls().length }) : "";
  const lineCount = () => tr(executeLines(code()) === 1 ? "toolLinesOne" : "toolLinesMany", { count: executeLines(code()) });
  const outputLines = () =>
    tr(executeLines(outputText()) === 1 ? "toolLinesOne" : "toolLinesMany", { count: executeLines(outputText()) });
  // Code and output share one gutter width, sized to the longer block, so their
  // content starts on the same column as the reference details dialog.
  const digits = () =>
    String(Math.max(executeLines(code()), outputText() && !error() ? executeLines(outputText()) : 0)).length;

  return (
    <>
      <BasicTool
        id={`execute:${props.tool.id}`}
        title={tr("toolExecute")}
        subtitleNode={
          <Show when={subtitle()}>
            {(text) => <ShellSubmessage text={text()} animate={pending()} />}
          </Show>
        }
        hideSubtitleWhenOpen
        status={error() ? "error" : pending() ? "running" : "completed"}
        allowOpenWhilePending
        compact
        rail={false}
        hasContent={calls().length > 0 || Boolean(error()) || Boolean(output())}
        action={
          <Show when={viewable()}>
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-label={tr("toolExecuteViewCode")}
                title={tr("toolExecuteViewCode")}
                aria-haspopup="dialog"
                class="grid size-6 place-items-center rounded-xs text-text-faint hover:text-text-base"
                onClick={(event) => {
                  event.stopPropagation();
                  setCodeOpen(true);
                }}
              >
                <Code class="size-4" />
              </TooltipTrigger>
              <TooltipContent side="top">{tr("toolExecuteViewCode")}</TooltipContent>
            </Tooltip>
          </Show>
        }
      >
        <div data-component="execute-tool-calls">
          <For each={calls()}>
            {(call, index) => (
              <ExecuteCallRow
                call={call}
                error={index() === owner() ? error() : undefined}
                disclosureKey={`${props.tool.id}:${index()}`}
              />
            )}
          </For>
          <Show when={owner() === -1 && error()}>
            {(message) => <ExecuteCallRow error={message()} disclosureKey={`${props.tool.id}:error`} />}
          </Show>
          <Show when={output()}>
            {(text) => <ExecuteOutputRow output={text()} disclosureKey={props.tool.id} />}
          </Show>
        </div>
      </BasicTool>

      <Show when={code()}>
        {(source) => (
          <Dialog open={codeOpen()} onOpenChange={setCodeOpen}>
            <DialogContent size="large" height="fit" class="bg-bg-base">
              <DialogTitle class="flex items-center gap-2">
                <span>{tr("toolExecute")}</span>
                <span
                  data-slot="execute-details-status"
                  data-status={error() ? "error" : pending() ? "running" : "completed"}
                >
                  {status()}
                </span>
                <Show when={callCount()}>
                  <span data-slot="execute-details-meta">{callCount()}</span>
                </Show>
              </DialogTitle>
              <div
                data-component="execute-details"
                style={{ "--execute-details-number-width": `${digits()}ch` } as JSX.CSSProperties}
              >
                <section data-slot="execute-details-section">
                  <header data-slot="execute-details-section-header">
                    <span data-slot="execute-details-section-label">{tr("toolExecuteCode")}</span>
                    <span data-slot="execute-details-section-meta">{lineCount()}</span>
                    <CopyButton text={source()} label={tr("toolExecuteCopyCode")} />
                  </header>
                  <NumberedSource text={source()} language="js" digits={digits()} slot="execute-details-output" />
                </section>
                <Show
                  when={error()}
                  fallback={
                    <Show when={output()}>
                      {(text) => (
                        <section data-slot="execute-details-section">
                          <header data-slot="execute-details-section-header">
                            <span data-slot="execute-details-section-label">{tr("toolExecuteOutput")}</span>
                            <span data-slot="execute-details-section-meta">{outputLines()}</span>
                            <CopyButton text={outputText()} label={tr("toolExecuteCopyOutput")} />
                          </header>
                          <NumberedSource
                            text={outputText()}
                            language={formattedOutput().json !== undefined && formattedOutput().rest === undefined ? "json" : "text"}
                            digits={digits()}
                            slot="execute-details-output"
                          />
                        </section>
                      )}
                    </Show>
                  }
                >
                  {(message) => (
                    <section data-slot="execute-details-section">
                      <header data-slot="execute-details-section-header">
                        <span data-slot="execute-details-section-label">{tr("toolExecuteError")}</span>
                        <CopyButton text={message()} label={tr("toolExecuteCopyError")} />
                      </header>
                      <pre data-slot="execute-details-error">{message()}</pre>
                    </section>
                  )}
                </Show>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </Show>
    </>
  );
}

function QuestionTool(props: { tool: ToolRun }) {
  const tr = useT();
  const questions = createMemo(() => {
    const value = parseArgs(props.tool.arguments).questions;
    return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  });

  const answers = createMemo(() => {
    const value = props.tool.metadata?.answers;
    if (Array.isArray(value)) {
      return value.map((item) => (Array.isArray(item) ? item.map(String) : []));
    }
    const parsed: string[][] = [];
    const pattern = /"([^"]*)"="([^"]*)"/g;
    for (const match of (props.tool.output ?? "").matchAll(pattern)) parsed.push([match[2]]);
    return parsed;
  });

  const completed = () => answers().length > 0;
  const subtitle = () => {
    if (!questions().length) return "";
    return completed()
      ? tr("toolAnswered", { count: questions().length })
      : tr(questions().length === 1 ? "toolQuestionOne" : "toolQuestionsMany", { count: questions().length });
  };

  return (
    <BasicTool
      id={`question:${props.tool.id}`}
      title={tr("toolQuestions")}
      subtitle={subtitle()}
      defaultOpen={completed()}
      hasContent={completed() && questions().length > 0}
    >
      <div data-component="question-answers">
        <For each={questions()}>
          {(question, index) => (
            <div data-slot="question-answer-item">
              <div data-slot="question-text">
                <LinkedText text={typeof question.question === "string" ? question.question : ""} />
              </div>
              <div data-slot="answer-text">{answers()[index()]?.join(", ") || tr("toolNoAnswer")}</div>
            </div>
          )}
        </For>
      </div>
    </BasicTool>
  );
}

function SkillTool(props: { tool: ToolRun }) {
  const tr = useT();
  const name = () => skillName(props.tool) || "skill";
  const kind = () => tr("toolSkillKind");
  return (
    <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${name()} ${kind()}`}>
      <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
      <span data-slot="tool-loaded-value">
        <TextShimmer text={name()} active={!props.tool.done} />
      </span>
      <span data-slot="tool-loaded-kind">{kind()}</span>
    </div>
  );
}

function SubagentCard(props: {
  tool: ToolRun;
  onOpenSession?: (id: string) => void;
  runningSubagents?: ReadonlySet<string>;
}) {
  const tr = useT();
  const args = () => parseArgs(props.tool.arguments);
  const title = () => toolTitle(props.tool, args());
  const sessionID = () => subagentSessionID(props.tool);
  const description = () => stringArg(args(), "description");
  const background = () => args().background === true || props.tool.metadata?.background === true;
  const subtitle = () => description() || sessionID() || "";
  const clickable = () => Boolean(sessionID() && props.onOpenSession);
  const delegating = () => !props.tool.done && !sessionID() && !props.tool.output;
  const running = () => !props.tool.done || Boolean(sessionID() && props.runningSubagents?.has(sessionID()!));
  const state = () =>
    delegating() ? "delegating" : running() ? (background() ? "background" : "running") : "completed";

  const open = () => {
    const id = sessionID();
    if (id) props.onOpenSession?.(id);
  };

  return (
    <Show
      when={!delegating()}
      fallback={
        <div data-component="task-tool-delegating" data-state="delegating">
          <ActivityRing size={16} />
          <span>{tr("toolDelegating")}</span>
        </div>
      }
    >
      <div
        data-entry="subagent"
        data-state={state()}
        data-background={background() ? "true" : undefined}
        class="w-full min-w-0 transition-colors duration-200 motion-reduce:transition-none"
      >
        <BasicTool
          id={`subagent:${props.tool.id}`}
          hideDetails
          clickable={clickable()}
          onTriggerClick={open}
          ariaLabel={clickable() ? tr("toolOpenSession", { name: title() }) : undefined}
          trigger={
            <div data-component="task-tool-card">
              <div data-component="task-tool-surface">
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <Show when={running()}>
                      <ActivityRing size={16} />
                    </Show>
                    <span data-component="task-tool-title">{title()}</span>
                    <Show when={subtitle()}>
                      <span data-slot="basic-tool-tool-subtitle">{subtitle()}</span>
                    </Show>
                  </div>
                  <Show when={clickable()}>
                    <div data-component="task-tool-action">
                      <ChevronRight class="size-4" />
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          }
        />
      </div>
    </Show>
  );
}

function GenericTool(props: { tool: ToolRun }) {
  const tr = useT();
  const args = () => parseArgs(props.tool.arguments);
  const label = () => toolSubtitle(props.tool, args());
  const rawName = () =>
    typeof props.tool.metadata?.mcpTool === "string" && props.tool.metadata.mcpTool
      ? props.tool.metadata.mcpTool
      : props.tool.name;
  return (
    <BasicTool
      id={`generic:${props.tool.id}`}
      title={tr("toolCalled", { name: rawName() })}
      subtitle={label()}
      args={genericArgs(args())}
      pending={!props.tool.done}
    />
  );
}

function questionSubtitle(_tool: ToolRun, args: Args): string {
  const questions = Array.isArray(args.questions) ? args.questions : [];
  return questions.length
    ? t(questions.length === 1 ? "toolQuestionOne" : "toolQuestionsMany", { count: questions.length })
    : "";
}

function subagentSubtitle(_tool: ToolRun, args: Args): string {
  return stringArg(args, "description") || stringArg(args, "agent");
}

function fileToolContent(tool: Accessor<ToolRun>, context: ToolRenderContext): JSX.Element {
  if (context.summaryOnly) {
    return (
      <BasicTool
        id={`${tool().name}:${tool().id}`}
        title={toolTitle(tool())}
        subtitle={toolSubtitle(tool())}
        pending={!tool().done}
      />
    );
  }
  return (
    <FileGroup
      tools={[tool()]}
      detail={context.detail}
      groupKey={context.groupKey}
      showHeader={tool().name === "edit"}
    />
  );
}

const TOOL_SPECS: Record<string, ToolSpec> = {
  read: {
    title: "toolRead",
    subtitle: fileSubtitle,
    render: (tool, context) => <ReadTool tool={tool()} workspace={context.workspace} />,
  },
  list: {
    title: "toolList",
    subtitle: directorySubtitle,
    render: (tool, context) => <ListTool tool={tool()} summaryOnly={context.summaryOnly} />,
  },
  glob: {
    title: "toolGlob",
    subtitle: directorySubtitle,
    args: patternArgs,
    render: (tool, context) => <SearchTool tool={tool()} summaryOnly={context.summaryOnly} />,
  },
  grep: {
    title: "toolGrep",
    subtitle: directorySubtitle,
    args: grepArgs,
    render: (tool, context) => <SearchTool tool={tool()} summaryOnly={context.summaryOnly} />,
  },
  shell: {
    title: "toolShell",
    subtitle: commandSubtitle,
    render: (tool, context) => (
      <ShellTool
        tool={tool()}
        defaultOpen={context.detail.shell.details === "expanded"}
        shellOutput={context.shellOutput?.(tool())}
      />
    ),
  },
  execute: {
    title: "toolExecute",
    subtitle: commandSubtitle,
    render: (tool) => <ExecuteTool tool={tool()} />,
  },
  browser: { title: "toolBrowser" },
  webfetch: {
    title: "toolWebfetch",
    subtitle: (_tool, args) => stringArg(args, "url"),
    render: (tool) => <WebfetchTool tool={tool()} />,
  },
  websearch: {
    title: "toolWebsearch",
    subtitle: (_tool, args) => stringArg(args, "query"),
    render: (tool) => <WebsearchTool tool={tool()} />,
  },
  edit: { title: "toolEdit", file: true, subtitle: fileSubtitle, render: fileToolContent },
  write: { title: "toolWrite", file: true, subtitle: fileSubtitle, render: fileToolContent },
  patch: { title: "toolPatch", file: true, subtitle: fileSubtitle, render: fileToolContent },
  apply_patch: { title: "toolPatch", file: true, render: fileToolContent },
  subagent: {
    title: "toolAgent",
    subtitle: subagentSubtitle,
    render: (tool, context) => (
      <SubagentCard
        tool={tool()}
        onOpenSession={context.onOpenSession}
        runningSubagents={context.runningSubagents}
      />
    ),
  },
  question: {
    title: "toolQuestions",
    subtitle: questionSubtitle,
    render: (tool) => <QuestionTool tool={tool()} />,
  },
  skill: {
    title: "toolSkill",
    render: (tool) => <SkillTool tool={tool()} />,
  },
};

function ToolDisplay(props: {
  tool: ToolRun;
  detail: TimelineDetail;
  groupKey: string;
  onOpenSession?: (id: string) => void;
  workspace?: string;
  runningSubagents?: ReadonlySet<string>;
  shellOutput?: (tool: ToolRun) => ShellOutputSource | undefined;
  summaryOnly?: boolean;
}) {
  const tr = useT();
  const spec = TOOL_SPECS[props.tool.name];
  // Getters keep a spec renderer's context live when the detail setting or a
  // callback changes without remounting the tool row.
  const context: ToolRenderContext = {
    get detail() {
      return props.detail;
    },
    get groupKey() {
      return props.groupKey;
    },
    get onOpenSession() {
      return props.onOpenSession;
    },
    get workspace() {
      return props.workspace;
    },
    get runningSubagents() {
      return props.runningSubagents;
    },
    get shellOutput() {
      return props.shellOutput;
    },
    get summaryOnly() {
      return props.summaryOnly;
    },
  };

  return (
    <Show when={props.tool.name !== "question" || props.tool.done || Boolean(props.tool.failed)}>
      <Switch
        fallback={<GenericTool tool={props.tool} />}
      >
        <Match when={props.tool.cancelled}>
          <div data-component="tool-cancelled" class="flex w-full items-center gap-2">
            <span class="text-meta leading-4 text-text-faint">{toolName(props.tool.name)}</span>
            <span class="text-meta leading-4 text-text-faint">·</span>
            <span class="text-meta leading-4 text-text-faint">{tr("toolCancelled")}</span>
          </div>
        </Match>
        <Match when={props.tool.name === "execute"}>
          <ExecuteTool tool={props.tool} />
        </Match>
        <Match when={props.tool.failed && props.tool.name === "question" && /dismissed this question/i.test(props.tool.output ?? "")}>
          <div class="flex w-full justify-end">
            <span class="text-meta leading-4 text-text-faint">{tr("toolDismissed")}</span>
          </div>
        </Match>
        <Match when={props.tool.failed}>
          <ToolErrorCard
            tool={props.tool.name}
            error={
              props.tool.output ||
              (typeof props.tool.metadata?.exit === "number" && props.tool.metadata.exit !== 0
                ? tr("toolCommandExited", { code: props.tool.metadata.exit })
                : tr("toolFailureGeneric"))
            }
            title={props.tool.name === "websearch" ? webProviderLabel(props.tool) : undefined}
            subtitle={
              props.tool.name === "subagent"
                ? stringArg(parseArgs(props.tool.arguments), "description") || subagentSessionID(props.tool)
                : toolSubtitle(props.tool)
            }
            id={props.tool.id}
            onSubtitleClick={
              props.tool.name === "subagent" && subagentSessionID(props.tool) && props.onOpenSession
                ? () => props.onOpenSession?.(subagentSessionID(props.tool)!)
                : undefined
            }
          />
        </Match>
        <Match when={Boolean(spec?.render)}>
          <div data-component="tool-part-wrapper" data-timeline-part-id={props.tool.id}>
            {spec!.render!(() => props.tool, context)}
          </div>
        </Match>
      </Switch>
    </Show>
  );
}

type ToolRowItem =
  | { key: string; variant: "read" | "files" | "skills"; tools: ToolRun[] }
  | {
      key: string;
      variant: "tool" | "reasoning" | "shell" | "notice" | "loaded" | "text";
      part: ContextPart;
    };

function partOfItem(item: ToolRowItem | undefined): ContextPart | undefined {
  return item && "part" in item ? item.part : undefined;
}

function toolsOfItem(item: ToolRowItem | undefined): ToolRun[] {
  return item && "tools" in item ? item.tools : [];
}

function partEntryOf(item: ToolRowItem | undefined): TimelineEntry | undefined {
  const part = partOfItem(item);
  return part && part.kind !== "tool" ? part.entry : undefined;
}

function toolOfItem(item: ToolRowItem | undefined): ToolRun | undefined {
  const part = partOfItem(item);
  return part?.kind === "tool" ? part.tool : undefined;
}

function textOfItem(item: ToolRowItem | undefined): string {
  const part = partOfItem(item);
  return part && part.kind !== "tool" ? (part.entry.text ?? "") : "";
}

function groupParts(parts: ContextPart[]): ToolRowItem[] {
  const items: ToolRowItem[] = [];

  for (const part of parts) {
    if (part.kind !== "tool") {
      items.push({ key: `${part.kind}:${part.entry.key}`, variant: part.kind, part });
      continue;
    }
    const tool = part.tool;
    // Loaded instruction files and images keep their own rows, as the reference does.
    const groupedRead =
      !tool.failed && tool.name === "read" && !isImageRead(tool) && loadedPaths(tool).length === 0;
    const variant = groupedRead
      ? "read"
      : !tool.failed && isFileTool(tool.name)
        ? "files"
        : !tool.failed && tool.name === "skill"
          ? "skills"
          : undefined;

    if (!variant) {
      items.push({ key: `tool:${tool.id}`, variant: "tool", part });
      continue;
    }

    const previous = items[items.length - 1];
    if (previous && "tools" in previous && previous.variant === variant) previous.tools.push(tool);
    else items.push({ key: `${variant}:${tool.id}`, variant, tools: [tool] });
  }

  return items;
}

function scrollParent(element: HTMLElement): HTMLElement | undefined {
  const parent = element.parentElement;
  if (!parent) return undefined;
  if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
  return scrollParent(parent);
}

/** A notice folded into a group reads as one compact line, without a divider. */
function GroupedNotice(props: { entry: TimelineEntry }) {
  const tr = useT();
  const text = () => (props.entry.notice ? noticeText(props.entry.notice, tr) : (props.entry.text ?? ""));

  return (
    <Show when={text()}>
      {(label) => (
        <div data-slot="session-timeline-notice" class="w-full truncate py-1 text-body leading-5 text-text-faint">
          {label()}
        </div>
      )}
    </Show>
  );
}

/** Instruction files loaded during the turn. */
export function LoadedRow(props: { paths: string[] }) {
  const tr = useT();
  return (
    <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${props.paths.join(", ")}`}>
      <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
      <span data-slot="tool-loaded-value">{props.paths.join(", ")}</span>
    </div>
  );
}

/** An instruction load folded into a group, matching its standalone row. */
function GroupedLoaded(props: { entry: TimelineEntry }) {
  return (
    <Show when={props.entry.loaded?.length ? props.entry.loaded : undefined}>
      {(paths) => <LoadedRow paths={paths()} />}
    </Show>
  );
}

function thinkingElapsed(parts: ContextPart[], now: number): string {
  const reasoning = parts.find((part) => part.kind === "reasoning");
  if (!reasoning) return "";
  const created = reasoning.entry.created ? Date.parse(reasoning.entry.created) : NaN;
  if (!Number.isFinite(created)) return "";
  const total = Math.max(0, Math.floor((now - created) / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

export function ToolBlock(props: {
  parts: ContextPart[];
  busy?: boolean;
  detail?: TimelineDetailInput;
  onOpenFile?: (path: string) => void;
  onOpenSession?: (sessionID: string) => void;
  workspace?: string;
  runningSubagents?: ReadonlySet<string>;
  shellOutput?: (tool: ToolRun) => ShellOutputSource | undefined;
}) {
  const tr = useT();
  const detail = createMemo(() => timelineDetail(props.detail));
  const visible = () => props.parts;
  const tools = createMemo(() => visible().flatMap((part) => (part.kind === "tool" ? [part.tool] : [])));
  const shells = createMemo(() => visible().flatMap((part) => (part.kind === "shell" ? [part] : [])));
  const reasoning = createMemo(() => visible().flatMap((part) => (part.kind === "reasoning" ? [part] : [])));
  const liveReasoning = createMemo(() => reasoning().some((part) => part.entry.live));
  // A finished thought is no longer "Thinking"; the next live turn phase owns
  // that label instead of every busy group.
  const thinking = createMemo(
    () => reasoning().length > 0 && reasoning().length === visible().length && liveReasoning(),
  );
  const first = () => visible()[0];
  // Commentary can join ahead of the tools and later leave, so it never anchors
  // the block. The first non-text part does, but a reasoning or notice entry key
  // is rebuilt when the finished turn is reloaded from history. A tool keeps the
  // call id it was streamed with, so it is the one identity that survives that
  // reload; keep the anchor as an alias for blocks that never held a tool.
  const anchor = () => visible().find((part) => part.kind !== "text") ?? first();
  const anchorKey = () => {
    const value = anchor();
    if (!value) return "context";
    return value.kind === "tool" ? value.tool.id : value.entry.key;
  };
  const key = () => tools()[0]?.id ?? anchorKey();
  const disclosureKeys = createMemo(() =>
    key() === anchorKey() ? [`group:${key()}`] : [`group:${key()}`, `group:${anchorKey()}`],
  );
  const [open, setOpen] = useDisclosure(disclosureKeys());
  let root: HTMLDivElement | undefined;
  const [now, setNow] = createSignal(Date.now());
  const pending = createMemo(() => Boolean(props.busy) || tools().some((tool) => !tool.done));

  const change = (next: boolean) => {
    // Collapsing from a stuck header would leave the viewport below the group;
    // keep the header in place by scrolling before the shorter content clamps.
    if (!next && root) {
      const trigger = root.querySelector<HTMLElement>(
        ':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]',
      );
      const stuck = trigger ? trigger.getBoundingClientRect().top - root.getBoundingClientRect().top : 0;
      if (stuck > 0) scrollParent(root)?.scrollBy?.({ top: -stuck, behavior: "instant" });
    }
    setOpen(next);
  };

  createEffect(() => {
    if (!thinking()) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    onCleanup(() => window.clearInterval(timer));
  });

  const names = createMemo(() => {
    const labels = unique([
      ...tools().map((tool) =>
        tool.name === "subagent"
          ? toolName("subagent")
          : tool.name === "websearch"
            ? webProviderLabel(tool)
            : toolTitle(tool),
      ),
      ...(shells().length ? [tr("toolShell")] : []),
    ]);
    // Code Mode callers scan for this row; keep it at the front when the summary
    // is clipped to one line in a narrow transcript.
    const executeLabel = tr("toolExecute");
    labels.sort((a, b) => Number(b === executeLabel) - Number(a === executeLabel));
    return labels;
  });
  const count = createMemo(() => tools().length + shells().length || reasoning().length);
  const title = () =>
    names().join(", ") ||
    (reasoning().length > 0
      ? reasoning().length === 1
        ? tr("toolThought")
        : tr("toolThoughts")
      : tr("toolUpdates"));
  const label = () => (thinking() ? tr("toolThinking") : title());
  const elapsed = () => (thinking() ? thinkingElapsed(visible(), now()) : "");
  const showCount = () => !thinking() && count() > 0;
  const countText = () =>
    `${tr("toolUsed")} ${count()} ${tr("toolUsedBetween")}${tr("toolUsedBetween") ? " " : ""}${title()}`;

  // Group keys stay stable while parts append, so a streamed tool keeps its
  // mounted row instead of remounting the whole summary list.
  const items = createMemo(() => groupParts(visible()));
  const itemKeys = createMemo(() => items().map((item) => item.key));
  const itemByKey = createMemo(() => new Map(items().map((item) => [item.key, item])));

  return (
    <Show when={visible().length > 0}>
      <div
        ref={(el) => (root = el)}
        data-component="collapsed-tool-group"
        data-notices-only={visible().every((part) => part.kind === "notice" || part.kind === "loaded") ? "" : undefined}
        data-timeline-part-ids={visible().map((part) => (part.kind === "tool" ? part.tool.id : part.entry.key)).join(",")}
      >
        <BasicTool
          id={`group:${key()}`}
          compact
          hasContent
          open={open()}
          onOpenChange={change}
          status={pending() ? "running" : "completed"}
          allowOpenWhilePending
          ariaLabel={thinking() ? tr("toolThinking") : showCount() ? countText() : title()}
          trigger={
            <div data-component="context-tool-group-trigger">
              <span data-slot="context-tool-group-title">
                <Show when={showCount()}>
                  <span data-slot="context-tool-group-usage">
                    <span data-slot="context-tool-group-prefix">{tr("toolUsed")}</span>
                    <AnimatedNumber value={count()} />
                    <Show when={tr("toolUsedBetween")}>
                      <span data-slot="context-tool-group-prefix">{tr("toolUsedBetween")}</span>
                    </Show>
                  </span>
                </Show>
                <span data-slot="basic-tool-tool-title" title={label()}>
                  <TextShimmer text={label()} active={thinking()} />
                </span>
                <Show when={elapsed()}>
                  <span data-slot="basic-tool-tool-subtitle">{elapsed()}</span>
                </Show>
              </span>
            </div>
          }
        >
          <div data-component="context-tool-group-list">
            <For each={itemKeys()}>
              {(itemKey) => {
                const item = () => itemByKey().get(itemKey);
                return (
                  <div data-slot="context-tool-group-item">
                    <Switch>
                      <Match when={item()?.variant === "read"}>
                        <ReadGroup tools={toolsOfItem(item())} groupKey={`${key()}:${itemKey}`} />
                      </Match>
                      <Match when={item()?.variant === "files"}>
                        <FileGroup tools={toolsOfItem(item())} detail={detail()} groupKey={`${key()}:${itemKey}`} />
                      </Match>
                      <Match when={item()?.variant === "skills"}>
                        <SkillGroup tools={toolsOfItem(item())} />
                      </Match>
                      <Match when={item()?.variant === "reasoning"}>
                        <ReasoningRow
                          entry={partEntryOf(item())!}
                          detail={detail()}
                          insideGroup
                          autoOpen={thinking()}
                        />
                      </Match>
                      <Match when={item()?.variant === "shell"}>
                        <Show when={partEntryOf(item())?.shell}>
                          {(shell) => (
                            <SessionShellMessage
                              shell={shell()}
                              entryKey={partEntryOf(item())!.key}
                              detail={detail()}
                            />
                          )}
                        </Show>
                      </Match>
                      <Match when={item()?.variant === "notice"}>
                        <Show when={partEntryOf(item())}>
                          {(entry) => <GroupedNotice entry={entry()} />}
                        </Show>
                      </Match>
                      <Match when={item()?.variant === "loaded"}>
                        <Show when={partEntryOf(item())}>
                          {(entry) => <GroupedLoaded entry={entry()} />}
                        </Show>
                      </Match>
                      <Match when={item()?.variant === "text"}>
                        <Markdown text={textOfItem(item())} />
                      </Match>
                      <Match when={item()?.variant === "tool"}>
                        <Show when={toolOfItem(item())}>
                          {(tool) => (
                            <ToolDisplay
                              tool={tool()}
                              detail={detail()}
                              groupKey={key()}
                              onOpenSession={props.onOpenSession}
                              workspace={props.workspace}
                              runningSubagents={props.runningSubagents}
                              shellOutput={props.shellOutput}
                              summaryOnly
                            />
                          )}
                        </Show>
                      </Match>
                    </Switch>
                  </div>
                );
              }}
            </For>
          </div>
        </BasicTool>
      </div>
    </Show>
  );
}

/** Standalone tools keep their full detail row and content outside a group. */
export function ToolStandalone(props: {
  tool: ToolRun;
  detail?: TimelineDetailInput;
  onOpenSession?: (sessionID: string) => void;
  workspace?: string;
  runningSubagents?: ReadonlySet<string>;
  shellOutput?: (tool: ToolRun) => ShellOutputSource | undefined;
}) {
  const detail = createMemo(() => timelineDetail(props.detail));
  return (
    <div data-entry="tool">
      <ToolDisplay
        tool={props.tool}
        detail={detail()}
        groupKey={`standalone:${props.tool.id}`}
        onOpenSession={props.onOpenSession}
        workspace={props.workspace}
        runningSubagents={props.runningSubagents}
        shellOutput={props.shellOutput}
      />
    </div>
  );
}

/** Provider reasoning folded into a single row; live text shimmers. */
export function ReasoningRow(props: {
  entry: TimelineEntry;
  detail?: TimelineDetailInput;
  insideGroup?: boolean;
  /** The group already reads as Thinking, so opening it shows the thoughts themselves. */
  autoOpen?: boolean;
}) {
  const tr = useT();
  const detail = createMemo(() => timelineDetail(props.detail));
  const text = () => props.entry.text ?? "";
  const live = () => props.entry.live;
  const duration = () => reasoningDuration(props.entry.created, props.entry.endedAt);
  const heading = () => (live() ? reasoningHeading(text()) : undefined);
  const label = () => (live() ? tr("toolThinking") : tr("toolThought"));
  const hasText = () => Boolean(text().trim());

  return (
    <div data-component="reasoning-part" data-entry="reasoning">
      <BasicTool
        id={`reasoning:${props.entry.key}`}
        compact
        hasContent={hasText()}
        status={live() ? "running" : "completed"}
        allowOpenWhilePending
        hideDetails={!hasText()}
        defaultOpen={Boolean(props.autoOpen) || detail().thinking.details === "expanded"}
        trigger={(open) => (
          <div data-slot="basic-tool-tool-info-structured">
            <div data-slot="basic-tool-tool-info-main">
              <span data-slot="basic-tool-tool-title">
                <TextShimmer text={label()} active={live()} />
              </span>
              <Show when={live() && !open && heading()}>
                <span data-slot="basic-tool-tool-subtitle">{heading()}</span>
              </Show>
              <Show when={!live() && duration()}>
                <span data-slot="basic-tool-tool-subtitle">{duration()}</span>
              </Show>
            </div>
          </div>
        )}
      >
        <Markdown text={text()} class="reasoning-markdown" />
      </BasicTool>
    </div>
  );
}
