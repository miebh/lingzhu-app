import {
  createContext,
  memo,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

type Args = Record<string, unknown>;

const TITLE_KEYS: Record<string, MessageKey> = {
  read: "toolRead",
  list: "toolList",
  glob: "toolGlob",
  grep: "toolGrep",
  shell: "toolShell",
  execute: "toolExecute",
  browser: "toolBrowser",
  webfetch: "toolWebfetch",
  websearch: "toolWebsearch",
  edit: "toolEdit",
  write: "toolWrite",
  patch: "toolPatch",
  apply_patch: "toolPatch",
  question: "toolQuestions",
  skill: "toolSkill",
  subagent: "toolAgent",
};

/** Localized display name for a tool id; unknown MCP tools keep their raw name. */
function toolName(name: string): string {
  const key = TITLE_KEYS[name];
  return key ? t(key) : name;
}

const isFileTool = (name: string) =>
  name === "edit" || name === "write" || name === "patch" || name === "apply_patch";
const IMAGE_PATH = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

const ToolScopeContext = createContext("");

/** Keeps disclosure slices inside one session; tool IDs repeat across sessions. */
export function ToolScopeProvider({ scope, children }: { scope: string; children: ReactNode }) {
  return <ToolScopeContext.Provider value={scope}>{children}</ToolScopeContext.Provider>;
}

// Expanded state survives virtualization and transcript re-renders, like the
// desktop disclosure store. Every row keys its own slice.
const disclosures = new Map<string, boolean>();
// Listeners are scoped to their slice: toggling one card must not wake every
// mounted tool row, and a long transcript mounts many of them.
const disclosureListeners = new Map<string, Set<() => void>>();

// Aliases are joined into one signature so the effect keeps a stable dependency
// while the component reads each key separately.
const DISCLOSURE_SEPARATOR = "\u0000";

function disclosureValue(keys: readonly string[], fallback: boolean) {
  for (const key of keys) {
    const value = disclosures.get(key);
    if (value !== undefined) return value;
  }
  return fallback;
}

/**
 * Open state for one disclosure. A row may pass several keys for the same
 * block: the first is the durable identity and later ones are aliases that
 * cover a rebuilt key. Reading prefers the first key that has a stored value,
 * and writing records the choice under every key, so an expanded block stays
 * expanded when a live transcript row is replaced by its persisted copy.
 */
export function useDisclosure(key: string | readonly string[], fallback = false) {
  const scope = useContext(ToolScopeContext);
  const keys = (typeof key === "string" ? [key] : key).map((item) => (scope ? `${scope}:${item}` : item));
  const signature = keys.join(DISCLOSURE_SEPARATOR);
  const [open, setOpenState] = useState(() => disclosureValue(keys, fallback));

  useEffect(() => {
    const scoped = signature.split(DISCLOSURE_SEPARATOR);
    const update = () => setOpenState(disclosureValue(scoped, fallback));
    const listeners = scoped.map((item) => {
      const set = disclosureListeners.get(item) ?? new Set<() => void>();
      set.add(update);
      disclosureListeners.set(item, set);
      return [item, set] as const;
    });
    // A key can join a block after the user already opened it, such as the
    // first tool that arrives after a thought. Carry the stored choice onto the
    // new alias so the next render still finds it.
    if (scoped.some((item) => disclosures.get(item) !== undefined)) {
      const stored = disclosureValue(scoped, fallback);
      for (const item of scoped) {
        if (disclosures.get(item) === undefined) disclosures.set(item, stored);
      }
    }
    update();
    return () => {
      for (const [item, set] of listeners) {
        set.delete(update);
        if (set.size === 0) disclosureListeners.delete(item);
      }
    };
  }, [signature, fallback]);

  const setOpen = (next: boolean) => {
    for (const item of keys) disclosures.set(item, next);
    for (const item of keys) disclosureListeners.get(item)?.forEach((listener) => listener());
  };

  return [open, setOpen] as const;
}

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

function toolSubtitle(tool: ToolRun, args = parseArgs(tool.arguments)): string {
  switch (tool.name) {
    case "read":
    case "edit":
    case "write":
    case "patch":
      return splitPath(stringArg(args, "path")).name;
    case "list":
    case "glob":
    case "grep":
      return displayDirectory(stringArg(args, "path"));
    case "shell":
    case "execute":
      return stringArg(args, "command");
    case "websearch":
      return stringArg(args, "query");
    case "webfetch":
      return stringArg(args, "url");
    case "subagent":
      return stringArg(args, "description") || stringArg(args, "agent");
    case "question": {
      const questions = Array.isArray(args.questions) ? args.questions : [];
      return questions.length
        ? t(questions.length === 1 ? "toolQuestionOne" : "toolQuestionsMany", { count: questions.length })
        : "";
    }
    default: {
      for (const key of LABEL_KEYS) {
        const value = stringArg(args, key);
        if (value) return value;
      }
      return "";
    }
  }
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

function toolArgs(tool: ToolRun, args = parseArgs(tool.arguments)): string[] {
  switch (tool.name) {
    case "glob":
      return stringArg(args, "pattern") ? [`pattern=${stringArg(args, "pattern")}`] : [];
    case "grep":
      return [
        stringArg(args, "pattern") ? `pattern=${stringArg(args, "pattern")}` : "",
        stringArg(args, "include") ? `include=${stringArg(args, "include")}` : "",
      ].filter(Boolean);
    default:
      return genericArgs(args);
  }
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
  titleNode?: ReactNode;
  trigger?: ReactNode | ((open: boolean) => ReactNode);
  subtitle?: string;
  subtitleNode?: ReactNode;
  subtitleClass?: string;
  args?: string[];
  trailing?: ReactNode;
  action?: ReactNode;
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
  children?: ReactNode;
}

function TriangleDown({ className, ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} {...rest}>
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
  const generatedID = useId();
  const key = props.id ?? generatedID;
  const [storedOpen, setStoredOpen] = useDisclosure(key, props.defaultOpen ?? false);
  const open = props.forceOpen || props.open || storedOpen;
  const expandable = props.hasContent ?? Boolean(props.children);
  const pending = props.pending ?? (props.status === "streaming" || props.status === "running");
  // A mounted body keeps its diff scroll, image state and disclosure children
  // alive when the row collapses, as the reference Collapsible does.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const toggle = () => {
    if (props.locked || !expandable) return;
    if (pending && !props.allowOpenWhilePending) return;
    const next = !open;
    setStoredOpen(next);
    props.onOpenChange?.(next);
  };

  const interactiveButton = !props.locked && (props.clickable || expandable);

  const trigger = (
    <div
      data-slot="collapsible-trigger"
      data-locked={props.locked ? "true" : undefined}
      data-hide-details={props.hideDetails ? "true" : undefined}
      aria-expanded={expandable ? open : undefined}
      aria-label={props.ariaLabel}
      role={interactiveButton ? "button" : undefined}
      tabIndex={interactiveButton ? 0 : undefined}
      onClick={props.locked ? undefined : (props.onTriggerClick ?? toggle)}
      onKeyDown={(event) => {
        if (props.locked) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        if (!expandable) {
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
              typeof props.trigger === "function" ? props.trigger(open) : props.trigger
            ) : (
              <div data-slot="basic-tool-tool-info-structured">
                <div data-slot="basic-tool-tool-info-main">
                  {props.titleNode ?? (
                    <span data-slot="basic-tool-tool-title">
                      <TextShimmer text={props.title ?? ""} active={pending} />
                    </span>
                  )}
                  {props.subtitleNode ? (
                    !(props.hideSubtitleWhenOpen && open) && props.subtitleNode
                  ) : (
                    props.subtitle &&
                    !(props.hideSubtitleWhenOpen && open) && (
                      <span
                        data-slot="basic-tool-tool-subtitle"
                        className={cn(props.subtitleClass, props.onSubtitleClick && "clickable")}
                        onClick={(event) => {
                          if (!props.onSubtitleClick) return;
                          event.stopPropagation();
                          props.onSubtitleClick();
                        }}
                      >
                        {props.subtitle}
                      </span>
                    )
                  )}
                  {props.args?.map((arg) => (
                    <span key={arg} data-slot="basic-tool-tool-arg">
                      {arg}
                    </span>
                  ))}
                  {props.trailing}
                </div>
              </div>
            )}
          </div>
        </div>
        {expandable && !props.hideDetails && !props.locked && <ToolArrow />}
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
      className="tool-collapsible"
    >
      {props.triggerAsLink ? (
        <a
          data-slot="collapsible-trigger"
          href={props.triggerAsLink}
          onClick={(event) => {
            if (!props.onTriggerClick) return;
            event.preventDefault();
            props.onTriggerClick();
          }}
        >
          {trigger}
        </a>
      ) : (
        trigger
      )}
      {props.action && <span data-slot="basic-tool-action">{props.action}</span>}
      {expandable && !props.hideDetails && mounted && (
        <div data-slot="collapsible-content" data-expanded={open ? "true" : undefined} hidden={!open}>
          {props.children}
        </div>
      )}
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    const target = value;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 180);
      setShown(Math.round(initial + (target - initial) * progress));
      if (progress < 1) frame.current = requestAnimationFrame(step);
      else from.current = target;
    };
    cancelAnimationFrame(frame.current ?? 0);
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current ?? 0);
  }, [value]);

  return <span data-slot="context-tool-group-count">{shown}</span>;
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
 * a line's text never changes, so the component memoizes on its two props;
 * without that, scrolling a long patch re-tokenizes every mounted line.
 */
const SyntaxText = memo(function SyntaxText({ text, language }: { text: string; language: string }) {
  return (
    <>
      {tokenize(text, language).map((token, index) =>
        token.kind ? (
          <span key={index} className={`tok-${token.kind}`}>
            {token.text}
          </span>
        ) : (
          <span key={index}>{token.text}</span>
        ),
      )}
    </>
  );
});

/**
 * A source block with one shared number gutter. Code and output sit in
 * sections of the same width, so their content starts on the same column.
 */
function NumberedSource({
  text,
  language,
  digits,
  slot,
}: {
  text: string;
  language: string;
  digits: number;
  slot: string;
}) {
  const lines = text.split("\n");
  return (
    <pre data-slot={slot} data-numbered="true">
      <code>
        {lines.map((line, index) => (
          <span key={index} data-slot="source-line">
            <span data-slot="source-number" style={{ width: `${digits}ch` }}>
              {index + 1}
            </span>
            <span data-slot="source-text">
              <SyntaxText text={line || " "} language={language} />
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}

function DiffLine({ row, language }: { row: DiffRow; language: string }) {
  if (row.kind === "hunk") {
    return (
      <div data-slot="diff-hunk">
        <span className="w-10 shrink-0" />
        <span className="w-3 shrink-0" />
        <span className="whitespace-pre">{row.text}</span>
      </div>
    );
  }

  const added = row.kind === "add";
  const removed = row.kind === "remove";

  return (
    <div data-slot="diff-line" data-kind={row.kind}>
      <span className="w-10 shrink-0 text-right tabular-nums select-none">{added ? row.next : row.old ?? ""}</span>
      <span className="diff-marker">
        {added && <span data-kind="add" />}
        {removed && <span data-kind="remove" />}
      </span>
      <span className="min-w-0 flex-1 select-text">
        <SyntaxText text={row.text || " "} language={language} />
      </span>
    </div>
  );
}

const DIFF_LINE_HEIGHT = 24;
const DIFF_VIEWPORT = 320;
const DIFF_WINDOW = 200;

/** Long diffs render a fixed 24px window so a large patch stays cheap to mount. */
function FileDiffRows({ file }: { file: FileDiff }) {
  const [scrollTop, setScrollTop] = useState(0);
  const language = languageOf(file.path);
  const pierre = diffAvailable() && Boolean(file.patch);
  if (file.rows.length === 0) return null;

  if (pierre) return <PierreDiff path={file.path} patch={file.patch} />;

  if (file.rows.length <= DIFF_WINDOW) {
    return (
      <div data-slot="diff-scroll">
        {file.rows.map((row, index) => (
          <DiffLine key={index} row={row} language={language} />
        ))}
      </div>
    );
  }

  const total = file.rows.length * DIFF_LINE_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / DIFF_LINE_HEIGHT) - 8);
  const visible = Math.ceil(DIFF_VIEWPORT / DIFF_LINE_HEIGHT) + 16;
  const end = Math.min(file.rows.length, start + visible);

  return (
    <div
      data-slot="diff-scroll"
      data-virtualized="true"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: total, position: "relative" }}>
        <div style={{ position: "absolute", insetInline: 0, top: start * DIFF_LINE_HEIGHT }}>
          {file.rows.slice(start, end).map((row, index) => (
            <DiffLine key={start + index} row={row} language={language} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FileRow({
  file,
  groupKey,
  detail,
  first,
}: {
  file: FileDiff;
  groupKey: string;
  detail: TimelineDetail;
  first: boolean;
}) {
  const path = splitPath(file.path);
  const expandable = file.rows.length > 0;
  // Each change row keys its own slice. Keying by path alone made every row for
  // the same file share one disclosure, so opening one expanded them all.
  const [open, setOpen] = useDisclosure(`${groupKey}:file:${file.id}`, detail.edit.details === "expanded");

  return (
    <div
      data-slot="accordion-item"
      data-type={file.status}
      data-expanded={open ? "" : undefined}
      data-closed={!open ? "" : undefined}
      data-first={first ? "true" : undefined}
    >
      <h3
        data-slot="accordion-header"
        data-component="sticky-accordion-header"
        data-expanded={open ? "" : undefined}
        data-closed={!open ? "" : undefined}
      >
        <button
          type="button"
          data-slot="accordion-trigger"
          data-expanded={open ? "" : undefined}
          data-closed={!open ? "" : undefined}
          aria-expanded={expandable ? open : undefined}
          onClick={() => expandable && setOpen(!open)}
          className={cn(!expandable && "cursor-default")}
        >
          <span data-slot="apply-patch-trigger-content">
            <span data-slot="apply-patch-file-info">
              <FileTypeIcon path={file.path} />
              <span data-slot="apply-patch-file-name-container">
                {path.directory && <span data-slot="apply-patch-directory">{path.directory}</span>}
                <span data-slot="apply-patch-filename">{path.name}</span>
              </span>
            </span>
            <span data-slot="apply-patch-trigger-actions">
              {file.status === "added" ? (
                <span data-slot="apply-patch-change" data-type="added">
                  Created
                </span>
              ) : file.status === "deleted" ? (
                <span data-slot="apply-patch-change" data-type="removed">
                  Deleted
                </span>
              ) : (
                <span data-component="diff-changes" data-appearance="standard">
                  <span data-slot="diff-changes-additions">+{file.added}</span>
                  <span data-slot="diff-changes-deletions">-{file.removed}</span>
                </span>
              )}
              <ChevronsUpDown className="size-3.5 text-text-faint" />
            </span>
          </span>
        </button>
      </h3>
      {expandable && open && (
        <div data-slot="accordion-content" data-expanded="">
          <div data-component="apply-patch-file-diff">
            <FileDiffRows file={file} />
          </div>
        </div>
      )}
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

export function FileGroup({
  tools,
  detail: detailValue,
  groupKey,
  showHeader = false,
  limit,
}: {
  tools: ToolRun[];
  detail: TimelineDetailInput;
  groupKey: string;
  showHeader?: boolean;
  /** Show only the first N files; the summary controls the Show all affordance. */
  limit?: number;
}) {
  const tr = useT();
  const detail = timelineDetail(detailValue);
  // `filesOf` parses patches and builds preview diffs; it only needs to run when
  // the tools themselves change, not on every parent render.
  const files = useMemo(() => filesOf(tools), [tools]);
  const shown = limit === undefined ? files : files.slice(0, limit);
  const diagnostics = useMemo(() => diagnosticsOf(tools), [tools]);

  const first = tools[0];
  const name = first?.name === "edit" || first?.name === "write" ? first.name : "patch";
  const title = toolName(name);
  const component =
    name === "edit" ? "edit-tool" : name === "write" ? "write-tool" : "apply-patch-tool";
  const header = showHeader || (files.length === 0 && name !== "write");

  const accordion = files.length > 0 && (
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
      {shown.map((file, index) => (
        <FileRow key={file.id} file={file} groupKey={groupKey} detail={detail} first={index === 0} />
      ))}
    </div>
  );

  const diagnosticsPanel = diagnostics.length > 0 && (
    <div data-component="diagnostics">
      {diagnostics.map((item, index) => (
        <div key={index} data-slot="diagnostic">
          <span data-slot="diagnostic-label">{tr("toolErrorLabel")}</span>
          <span data-slot="diagnostic-location">
            [{item.line ?? 1}:{item.column ?? 1}]
          </span>
          <span data-slot="diagnostic-message">{item.message ?? ""}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div data-component={component} data-header={header ? "" : undefined}>
      <div data-component="collapsible" data-rail={header ? undefined : "false"} className="tool-collapsible">
        {header && (
          <div data-slot="collapsible-trigger" data-locked="true" aria-expanded="true">
            <div data-component="tool-trigger">
              <div data-slot="basic-tool-tool-trigger-content">
                <div data-slot="basic-tool-tool-info">
                  <div data-slot="basic-tool-tool-info-structured">
                    <div data-slot="basic-tool-tool-info-main">
                      <span data-slot="basic-tool-tool-title">{title}</span>
                      {files.length > 0 && (
                        <span data-slot="basic-tool-tool-subtitle">
                          {tr(files.length === 1 ? "toolFileOne" : "toolFilesMany", { count: files.length })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div data-slot="collapsible-content" data-expanded="true">
          {accordion}
          {diagnosticsPanel}
        </div>
      </div>
    </div>
  );
}

export function ReadGroup({ tools, groupKey }: { tools: ToolRun[]; groupKey?: string }) {
  const tr = useT();
  const [expanded, setExpanded] = useDisclosure(`read:${groupKey ?? tools[0]?.id ?? "group"}`);
  const [truncated, setTruncated] = useState(false);
  const list = useRef<HTMLSpanElement>(null);
  const files = useMemo(
    () =>
      tools.map((tool) => {
        const args = parseArgs(tool.arguments);
        return { id: tool.id, name: splitPath(stringArg(args, "path")).name, args: readArgs(args) };
      }),
    [tools],
  );
  const signature = useMemo(
    () => files.map((file) => `${file.id}:${file.name}:${file.args.join(",")}`).join("|"),
    [files],
  );

  useEffect(() => {
    const element = list.current;
    if (!element || expanded) return;
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, signature]);

  const expandable = expanded || truncated;

  return (
    <div
      data-component="read-tool-group"
      data-timeline-part-ids={tools.map((tool) => tool.id).join(",")}
      data-expanded={expanded ? "true" : undefined}
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      onClick={() => expandable && setExpanded(!expanded)}
      onKeyDown={(event) => {
        if (!expandable) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setExpanded(!expanded);
      }}
    >
      <div data-component="tool-trigger">
        <div data-slot="basic-tool-tool-trigger-content">
          <div data-slot="basic-tool-tool-info">
            <div data-slot="basic-tool-tool-info-structured">
              <div data-slot="basic-tool-tool-info-main">
                <span data-slot="basic-tool-tool-title">
                  <TextShimmer text={tr("toolRead")} active={tools.some((tool) => !tool.done)} />
                </span>
                <span ref={list} data-slot="basic-tool-tool-subtitle">
                  {files.map((file, index) => (
                    <span key={file.id} data-slot="read-tool-group-file">
                      {file.name}
                      {file.args.map((arg) => (
                        <span key={arg} data-slot="basic-tool-tool-arg">{arg}</span>
                      ))}
                      {index < files.length - 1 && ", "}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </div>
        </div>
        {expandable && (
          <span data-slot="read-tool-group-arrow" aria-hidden="true">
            <TriangleDown className="size-4 text-text-faint" />
          </span>
        )}
      </div>
    </div>
  );
}

function SkillGroup({ tools }: { tools: ToolRun[] }) {
  const tr = useT();
  const names = unique(tools.map((tool) => skillName(tool) || "skill"));
  const running = tools.some((tool) => !tool.done);
  const kind = tr(names.length === 1 ? "toolSkillKind" : "toolSkillKindPlural");
  const label = `${names.join(", ")} ${kind}`;

  return (
    <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${label}`}>
      <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
      <span data-slot="tool-loaded-value">
        <TextShimmer text={names.join(", ")} active={running} />
      </span>
      <span data-slot="tool-loaded-kind">{kind}</span>
    </div>
  );
}

function skillName(tool: ToolRun): string {
  const metadata = tool.metadata?.name;
  if (typeof metadata === "string" && metadata) return metadata;
  const args = parseArgs(tool.arguments);
  return stringArg(args, "id") || stringArg(args, "name");
}

function ToolErrorCard({
  tool,
  error,
  subtitle,
  title,
  id,
  onSubtitleClick,
}: {
  tool: string;
  error: string;
  subtitle?: string;
  title?: string;
  id: string;
  onSubtitleClick?: () => void;
}) {
  const tr = useT();
  const [open, setOpen] = useDisclosure(`error:${id}`);
  const [clipped, setClipped] = useState(false);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const cleaned = error.replace(/^Error:\s*/, "").trim();
  const tail = cleaned.startsWith(`${tool} `) ? cleaned.slice(tool.length + 1) : cleaned;
  const head = (tail.split(": ")[0] ?? "").trim();
  const summary = head ? capitalize(head) : tr("toolFailed");
  const name = title ?? toolName(tool);

  useEffect(() => {
    if (open) return;
    const element = subtitleRef.current;
    if (!element) return;
    setClipped((element.textContent ?? "").includes("\n") || element.scrollWidth > element.clientWidth);
  }, [open, subtitle]);

  return (
    <div data-component="card" data-kind="tool-error-card" data-tool={tool} data-open={open ? "true" : "false"}>
      <div data-component="collapsible" data-open={open ? "true" : "false"} className="tool-collapsible">
        <div
          data-slot="collapsible-trigger"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setOpen(!open);
          }}
        >
          <div data-component="tool-trigger">
            <div data-slot="basic-tool-tool-trigger-content">
              <span data-slot="basic-tool-tool-indicator" data-component="tool-error-card-icon">
                <TriangleAlert className="size-4 text-state-fg-danger" />
              </span>
              <div data-slot="basic-tool-tool-info">
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <span data-slot="basic-tool-tool-title">{name}</span>
                    {subtitle && !(open && clipped) && (
                      <span
                        ref={subtitleRef}
                        data-slot="basic-tool-tool-subtitle"
                        className={cn(onSubtitleClick && "clickable subagent-link")}
                        onClick={(event) => {
                          if (!onSubtitleClick) return;
                          event.stopPropagation();
                          onSubtitleClick();
                        }}
                      >
                        {subtitle}
                      </span>
                    )}
                    {!open && <span data-slot="tool-error-card-summary">{summary}</span>}
                  </div>
                </div>
              </div>
            </div>
            <ToolArrow />
          </div>
        </div>
        {open && (
          <div data-slot="collapsible-content" data-expanded="true">
            <div data-slot="tool-error-card-content">
              <span data-slot="tool-error-card-copy">
                <CopyButton text={cleaned} label={tr("toolCopyError")} />
              </span>
              {clipped && subtitle && <p data-slot="tool-error-card-subtitle">{subtitle}</p>}
              <p data-slot="card-description">{cleaned || tr("toolNoErrorOutput")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShellConsoleCopy({ text, label }: { text: string; label: string }) {
  return (
    <div data-slot="bash-copy">
      <CopyButton text={text} label={label} iconClass="size-4" />
    </div>
  );
}

function ConsoleOutput({ command, output, truncated }: { command?: string; output: string; truncated?: boolean }) {
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
        {command && (
          <div data-slot="bash-command">
            <ShellConsoleCopy text={command} label={tr("copyAction")} />
            <pre data-slot="bash-pre">
              <code>{command}</code>
            </pre>
          </div>
        )}
        {output && (
          <div data-slot="bash-result">
            <ShellConsoleCopy text={output} label={tr("toolExecuteCopyOutput")} />
            <pre data-slot="bash-pre">
              <code>
                <LinkedText text={output} />
              </code>
            </pre>
          </div>
        )}
      </div>
      {truncated && <div data-slot="bash-truncated">{tr("toolOutputTruncated")}</div>}
    </div>
  );
}

function ShellSubmessage({ text, animate }: { text: string; animate?: boolean }) {
  return (
    <span data-component="shell-submessage" dir="ltr">
      <span data-slot="shell-submessage-width">
        <span data-slot="basic-tool-tool-subtitle">
          <span data-slot="shell-submessage-value" className={cn(animate && "shell-submessage-in")}>
            {text}
          </span>
        </span>
      </span>
    </span>
  );
}

function ShellTrigger({
  value,
  pending,
  open,
  title,
}: {
  value: string;
  pending: boolean;
  open: boolean;
  title?: string;
}) {
  const tr = useT();
  return (
    <div data-slot="basic-tool-tool-info-structured">
      <div data-slot="basic-tool-tool-info-main">
        <span data-slot="basic-tool-tool-title">
          <TextShimmer text={title ?? tr("toolShell")} active={pending} />
        </span>
        {!open && (value ? (
          <ShellSubmessage text={value} animate={pending} />
        ) : pending ? (
          <span data-slot="basic-tool-tool-subtitle">{tr("toolWritingCommand")}</span>
        ) : null)}
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
function useShellOutput(source?: ShellOutputSource) {
  const [streamed, setStreamed] = useState<{ output: string; truncated: boolean }>();
  const cursor = useRef(0);

  useEffect(() => {
    if (!source) {
      setStreamed(undefined);
      cursor.current = 0;
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const page = await source.load(source.id, cursor.current);
        if (cancelled) return;
        cursor.current = page.cursor;
        setStreamed((current) => ({
          output: `${current?.output ?? ""}${page.output}`,
          truncated: Boolean(current?.truncated || page.truncated),
        }));
      } catch {
        // A missing job keeps the static snapshot; the activity pill reports it.
      }
      if (!cancelled && source.running) timer = window.setTimeout(poll, 700);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [source?.id, source?.running]);

  return streamed;
}

function ShellTool({
  tool,
  command,
  defaultOpen,
  title,
  shellOutput,
}: {
  tool?: ToolRun;
  command?: string;
  defaultOpen?: boolean;
  title?: string;
  /** Streams a background job's captured output instead of a static snapshot. */
  shellOutput?: ShellOutputSource;
}) {
  const args = tool ? parseArgs(tool.arguments) : {};
  const value = command ?? (stringArg(args, "command") || stringArg(args, "code"));
  const streamed = useShellOutput(shellOutput);
  const output = streamed?.output ?? stripAnsi(tool?.output ?? "");
  const pending = tool ? !tool.done : false;

  return (
    <BasicTool
      id={`shell:${tool?.id ?? value}`}
      status={pending ? "running" : "completed"}
      allowOpenWhilePending
      compact
      rail={false}
      hasContent
      defaultOpen={defaultOpen}
      trigger={(open) => <ShellTrigger value={value} pending={pending} open={open} title={title} />}
    >
      <ConsoleOutput
        command={value}
        output={output}
        truncated={streamed?.truncated || tool?.metadata?.truncated === true}
      />
    </BasicTool>
  );
}

export function SessionShellMessage({
  shell,
  entryKey,
  detail: detailValue,
}: {
  shell: ShellRun;
  entryKey: string;
  detail?: TimelineDetailInput;
}) {
  const tr = useT();
  const pending = shell.running === true;
  const detail = timelineDetail(detailValue);
  const error = shell.timedOut
    ? tr("toolCommandTimedOut")
    : !pending && shell.exit !== 0
      ? tr("toolCommandExited", { code: shell.exit ?? 0 })
      : "";

  return (
    <div data-component="session-shell-message" data-timeline-part-id={entryKey}>
      <BasicTool
        id={`shell-message:${entryKey}`}
        status={pending ? "running" : "completed"}
        allowOpenWhilePending
        compact
        rail={false}
        hasContent
        defaultOpen={detail.shell.details === "expanded"}
        trigger={(open) => <ShellTrigger value={shell.command ?? ""} pending={pending} open={open} />}
      >
        <ConsoleOutput command={shell.command ?? ""} output={stripAnsi(shell.output ?? "")} truncated={shell.truncated} />
      </BasicTool>
      {error && <ToolErrorCard tool="shell" error={error} subtitle={shell.command ?? ""} id={`shell-error:${entryKey}`} />}
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

function ReadTool({ tool, workspace }: { tool: ToolRun; workspace?: string }) {
  const tr = useT();
  const args = parseArgs(tool.arguments);
  const path = stringArg(args, "path");
  const image = tool.done ? readImage(tool) : undefined;
  const loaded = loadedPaths(tool).map((path) => relativePath(path, workspace));

  return (
    <>
      <BasicTool
        id={`read:${tool.id}`}
        title={tr("toolRead")}
        subtitle={splitPath(path).name}
        args={readArgs(args)}
        pending={!tool.done}
        hasContent={Boolean(image)}
      >
        {image && (
          <div data-component="read-image">
            <img src={`data:${image.mime};base64,${image.data}`} alt={image.name ?? splitPath(path).name} />
          </div>
        )}
      </BasicTool>
      {loaded.length > 0 && (
        <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${loaded.join(", ")}`}>
          <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
          <span data-slot="tool-loaded-value">{loaded.join(", ")}</span>
        </div>
      )}
    </>
  );
}

function ListTool({ tool, summaryOnly }: { tool: ToolRun; summaryOnly?: boolean }) {
  const tr = useT();
  const args = parseArgs(tool.arguments);
  const title = tr("toolList");
  const subtitle = displayDirectory(stringArg(args, "path"));
  const output = tool.output ?? "";

  if (summaryOnly) return <SearchSummary tool={tool} title={title} subtitle={subtitle} />;

  return (
    <BasicTool
      id={`list:${tool.id}`}
      title={title}
      subtitle={subtitle}
      pending={!tool.done}
      hasContent={Boolean(output)}
    >
      {output && <ToolOutput text={output} />}
    </BasicTool>
  );
}

/**
 * A search shows what was searched, never the raw list it returned, matching
 * the reference timeline. The match count stays on the row so the result is
 * still legible at a glance.
 */
function SearchTool({ tool, summaryOnly }: { tool: ToolRun; summaryOnly?: boolean }) {
  const tr = useT();
  const args = parseArgs(tool.arguments);
  const count = tool.done ? matchCount(tool, tool.output ?? "") : undefined;
  const title = tool.name === "glob" ? tr("toolGlob") : tr("toolGrep");
  const subtitle = displayDirectory(stringArg(args, "path"));
  const searchArgs = toolArgs(tool, args);
  const output = tool.output ?? "";

  if (summaryOnly) {
    const trailing = count ? (
      <span data-slot="context-tool-group-matches">
        {tr(count === 1 ? "toolMatchOne" : "toolMatchesMany", { count })}
      </span>
    ) : undefined;

    return (
      <SearchSummary
        tool={tool}
        title={title}
        subtitle={subtitle}
        args={searchArgs}
        trailing={trailing}
      />
    );
  }

  return (
    <BasicTool
      id={`${tool.name}:${tool.id}`}
      title={title}
      subtitle={subtitle}
      args={searchArgs}
      pending={!tool.done}
      hasContent={Boolean(output)}
    >
      {output && <ToolOutput text={output} />}
    </BasicTool>
  );
}

/** Raw search output, scrollable and capped like the reference tool row. */
function ToolOutput({ text }: { text: string }) {
  const tr = useT();
  return (
    <div
      data-component="tool-output"
      data-scrollable
      tabIndex={0}
      role="region"
      aria-label={tr("scrollableContent")}
    >
      <Markdown text={text} />
    </div>
  );
}

function SearchSummary({
  tool,
  title,
  subtitle,
  args,
  trailing,
}: {
  tool: ToolRun;
  title: string;
  subtitle: string;
  args?: string[];
  trailing?: ReactNode;
}) {
  return (
    <div data-component="tool-trigger">
      <div data-slot="basic-tool-tool-trigger-content">
        <div data-slot="basic-tool-tool-info">
          <div data-slot="basic-tool-tool-info-structured">
            <div data-slot="basic-tool-tool-info-main">
              <span data-slot="basic-tool-tool-title">
                <TextShimmer text={title} active={!tool.done} />
              </span>
              <span data-slot="basic-tool-tool-subtitle">{subtitle}</span>
              {args?.map((arg) => (
                <span key={arg} data-slot="basic-tool-tool-arg">
                  {arg}
                </span>
              ))}
            </div>
            {trailing && <span data-slot="context-tool-group-dot" />}
            {trailing}
          </div>
        </div>
      </div>
    </div>
  );
}

function WebfetchTool({ tool }: { tool: ToolRun }) {
  const tr = useT();
  const url = stringArg(parseArgs(tool.arguments), "url");
  return (
    <BasicTool
      id={`webfetch:${tool.id}`}
      hideDetails
      trigger={
        <div data-slot="basic-tool-tool-info-structured">
          <div data-slot="basic-tool-tool-info-main">
            <span data-slot="basic-tool-tool-title">
              <TextShimmer text={tr("toolWebfetch")} active={!tool.done} />
            </span>
            {url && (
              <a
                data-slot="basic-tool-tool-subtitle"
                className="webfetch-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                <span data-slot="webfetch-link-text">{url}</span>
                <SquareArrow data-slot="webfetch-link-icon" className="size-4" />
              </a>
            )}
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

function WebsearchTool({ tool }: { tool: ToolRun }) {
  const tr = useT();
  const [showAll, setShowAll] = useState(false);
  const query = stringArg(parseArgs(tool.arguments), "query");
  const title = webProviderLabel(tool);
  const links = useMemo(() => webUrls(tool.output), [tool.output]);
  const visible = showAll ? links : links.slice(0, 10);
  const remaining = Math.max(0, links.length - 10);

  return (
    <BasicTool
      id={`websearch:${tool.id}`}
      title={title}
      subtitle={query}
      subtitleClass="exa-tool-query"
      pending={!tool.done}
      hasContent={links.length > 0}
    >
      <div data-component="exa-tool-output">
        <div data-slot="exa-tool-links">
          {visible.map((url) => (
            <a
              key={url}
              data-slot="exa-tool-link"
              className="webfetch-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              <span data-slot="webfetch-link-text">{url}</span>
              <SquareArrow data-slot="webfetch-link-icon" className="size-4" />
            </a>
          ))}
          {!showAll && remaining > 0 && (
            <button type="button" data-slot="exa-tool-more" onClick={() => setShowAll(true)}>
              {tr("toolMore", { count: remaining })}
            </button>
          )}
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

function ExecuteCallRow({
  call,
  error,
  disclosureKey,
}: {
  call?: ExecuteCall;
  error?: string;
  disclosureKey: string;
}) {
  const [open, setOpen] = useDisclosure(`execute-call:${disclosureKey}`);
  const args = executeArgs(call?.input);
  const entries = Object.entries(call?.input ?? {});
  const failed = !call || call.status === "error";
  const expandable = entries.length > 0 || Boolean(error);
  const summary = call ? args.join(", ") : (error ?? "").split("\n")[0];

  const toggle = () => {
    if (!expandable || window.getSelection()?.toString()) return;
    setOpen(!open);
  };

  return (
    <div data-slot="execute-tool-call-item">
      <div
        data-slot="execute-tool-call"
        data-status={failed ? "error" : call?.status}
        data-expanded={open ? "true" : undefined}
        dir="ltr"
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (!expandable) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        }}
      >
        <span data-slot="execute-tool-call-marker">
          {failed ? <TriangleAlert className="size-3.5" /> : <span data-slot="execute-tool-call-arrow">›</span>}
        </span>
        {call?.tool && (
          <span data-slot="execute-tool-call-name">
            <TextShimmer text={call.tool} active={call.status === "running"} />
          </span>
        )}
        {!open && summary && (
          <span data-slot="execute-tool-call-args" title={summary}>
            {call ? `[${summary}]` : summary}
          </span>
        )}
        {error && <span data-slot="execute-tool-call-arrow">›</span>}
      </div>
      {open && (
        <>
          {entries.length > 0 && (
            <dl data-slot="execute-tool-call-input" dir="ltr">
              {entries.map(([key, value]) => (
                <div key={key} data-slot="execute-tool-call-input-entry">
                  <dt>{key}:</dt>
                  <dd>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd>
                </div>
              ))}
            </dl>
          )}
          {error && (
            <div data-slot="execute-tool-error" dir="ltr">
              <LinkedText text={error} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExecuteOutputRow({ output, disclosureKey }: { output: string; disclosureKey: string }) {
  const tr = useT();
  const [open, setOpen] = useDisclosure(`execute-output:${disclosureKey}`);
  const text = formatExecuteOutput(output).text;
  const lines = executeLines(text);

  const toggle = () => {
    if (window.getSelection()?.toString()) return;
    setOpen(!open);
  };

  return (
    <div data-slot="execute-tool-call-item">
      <div
        data-slot="execute-tool-call"
        data-kind="output"
        role="button"
        tabIndex={0}
        aria-expanded={open}
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
          {tr(lines === 1 ? "toolLinesOne" : "toolLinesMany", { count: lines })}
        </span>
      </div>
      {open && (
        <div data-slot="execute-tool-output">
          <ConsoleOutput output={text} />
        </div>
      )}
    </div>
  );
}

function executeLines(text: string) {
  return text.split("\n").length;
}

function ExecuteTool({ tool }: { tool: ToolRun }) {
  const tr = useT();
  const [codeOpen, setCodeOpen] = useState(false);
  const calls = executeCalls(tool);
  const pending = !tool.done;
  const code = (typeof executeField(tool, "code") === "string"
    ? String(executeField(tool, "code"))
    : stringArg(parseArgs(tool.arguments), "code")
  ).trimEnd();

  // A runtime failure shows on the failing call row; a successful script shows
  // its result as a collapsible output row.
  const error = (() => {
    if (!tool.failed && tool.metadata?.error !== true) return "";
    const explicit =
      typeof executeField(tool, "errorMessage") === "string" ? String(executeField(tool, "errorMessage")) : "";
    const text = stripAnsi(explicit || tool.output || tr("toolFailed")).replace(/^Error:\s*/, "").trim();
    return text || tr("toolFailed");
  })();
  const output = error
    ? ""
    : stripAnsi(
        typeof executeField(tool, "output") === "string" ? String(executeField(tool, "output")) : tool.output ?? "",
      )
        .replace(/\r\n?/g, "\n")
        .trim();
  const formattedOutput = formatExecuteOutput(output);
  const outputText = formattedOutput.text;
  const owner = calls.reduce((found, item, index) => (item.status === "error" ? index : found), -1);
  const subtitle = executeSubtitle(calls);
  const viewable = !pending && Boolean(code);
  const status = error ? tr("toolFailed") : pending ? tr("toolRunning") : tr("toolCompleted");
  const callCount = calls.length
    ? tr(calls.length === 1 ? "toolCallsOne" : "toolCallsMany", { count: calls.length })
    : "";
  const lineCount = tr(executeLines(code) === 1 ? "toolLinesOne" : "toolLinesMany", {
    count: executeLines(code),
  });
  const outputLines = tr(executeLines(outputText) === 1 ? "toolLinesOne" : "toolLinesMany", {
    count: executeLines(outputText),
  });
  // Code and output share one gutter width, sized to the longer block, so their
  // content starts on the same column as the reference details dialog.
  const digits = String(Math.max(executeLines(code), outputText && !error ? executeLines(outputText) : 0)).length;

  return (
    <>
      <BasicTool
        id={`execute:${tool.id}`}
        title={tr("toolExecute")}
        subtitleNode={subtitle ? <ShellSubmessage text={subtitle} animate={pending} /> : undefined}
        hideSubtitleWhenOpen
        status={error ? "error" : pending ? "running" : "completed"}
        allowOpenWhilePending
        compact
        rail={false}
        hasContent={calls.length > 0 || Boolean(error) || Boolean(output)}
        action={
          viewable ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={tr("toolExecuteViewCode")}
                  title={tr("toolExecuteViewCode")}
                  aria-haspopup="dialog"
                  className="grid size-6 place-items-center rounded-xs text-text-faint hover:text-text-base"
                  onClick={(event) => {
                    event.stopPropagation();
                    setCodeOpen(true);
                  }}
                >
                  <Code className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{tr("toolExecuteViewCode")}</TooltipContent>
            </Tooltip>
          ) : undefined
        }
      >
        <div data-component="execute-tool-calls">
          {calls.map((call, index) => (
            <ExecuteCallRow
              key={index}
              call={call}
              error={index === owner ? error : undefined}
              disclosureKey={`${tool.id}:${index}`}
            />
          ))}
          {owner === -1 && error && <ExecuteCallRow error={error} disclosureKey={`${tool.id}:error`} />}
          {output && <ExecuteOutputRow output={output} disclosureKey={tool.id} />}
        </div>
      </BasicTool>

      {code && (
        <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
          <DialogContent
            size="large"
            height="fit"
            className="bg-bg-base"
          >
            <DialogTitle className="flex items-center gap-2">
              <span>{tr("toolExecute")}</span>
              <span data-slot="execute-details-status" data-status={error ? "error" : pending ? "running" : "completed"}>
                {status}
              </span>
              {callCount && <span data-slot="execute-details-meta">{callCount}</span>}
            </DialogTitle>
            <div
              data-component="execute-details"
              style={{ ["--execute-details-number-width" as string]: `${digits}ch` }}
            >
              <section data-slot="execute-details-section">
                <header data-slot="execute-details-section-header">
                  <span data-slot="execute-details-section-label">{tr("toolExecuteCode")}</span>
                  <span data-slot="execute-details-section-meta">{lineCount}</span>
                  <CopyButton text={code} label={tr("toolExecuteCopyCode")} />
                </header>
                <NumberedSource text={code} language="js" digits={digits} slot="execute-details-output" />
              </section>
              {error ? (
                <section data-slot="execute-details-section">
                  <header data-slot="execute-details-section-header">
                    <span data-slot="execute-details-section-label">{tr("toolExecuteError")}</span>
                    <CopyButton text={error} label={tr("toolExecuteCopyError")} />
                  </header>
                  <pre data-slot="execute-details-error">{error}</pre>
                </section>
              ) : (
                output && (
                  <section data-slot="execute-details-section">
                    <header data-slot="execute-details-section-header">
                      <span data-slot="execute-details-section-label">{tr("toolExecuteOutput")}</span>
                      <span data-slot="execute-details-section-meta">{outputLines}</span>
                      <CopyButton text={outputText} label={tr("toolExecuteCopyOutput")} />
                    </header>
                    <NumberedSource
                      text={outputText}
                      language={formattedOutput.json !== undefined && formattedOutput.rest === undefined ? "json" : "text"}
                      digits={digits}
                      slot="execute-details-output"
                    />
                  </section>
                )
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function QuestionTool({ tool }: { tool: ToolRun }) {
  const tr = useT();
  const questions = useMemo(() => {
    const value = parseArgs(tool.arguments).questions;
    return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  }, [tool.arguments]);

  const answers = useMemo(() => {
    const value = tool.metadata?.answers;
    if (Array.isArray(value)) {
      return value.map((item) => (Array.isArray(item) ? item.map(String) : []));
    }
    const parsed: string[][] = [];
    const pattern = /"([^"]*)"="([^"]*)"/g;
    for (const match of (tool.output ?? "").matchAll(pattern)) parsed.push([match[2]]);
    return parsed;
  }, [tool.metadata?.answers, tool.output]);

  const completed = answers.length > 0;
  const subtitle = questions.length
    ? completed
      ? tr("toolAnswered", { count: questions.length })
      : tr(questions.length === 1 ? "toolQuestionOne" : "toolQuestionsMany", { count: questions.length })
    : "";

  return (
    <BasicTool
      id={`question:${tool.id}`}
      title={tr("toolQuestions")}
      subtitle={subtitle}
      defaultOpen={completed}
      hasContent={completed && questions.length > 0}
    >
      <div data-component="question-answers">
        {questions.map((question, index) => {
          const text = typeof question.question === "string" ? question.question : "";
          return (
            <div key={index} data-slot="question-answer-item">
              <div data-slot="question-text">
                <LinkedText text={text} />
              </div>
              <div data-slot="answer-text">{answers[index]?.join(", ") || tr("toolNoAnswer")}</div>
            </div>
          );
        })}
      </div>
    </BasicTool>
  );
}

function SkillTool({ tool }: { tool: ToolRun }) {
  const tr = useT();
  const name = skillName(tool) || "skill";
  const kind = tr("toolSkillKind");
  return (
    <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${name} ${kind}`}>
      <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
      <span data-slot="tool-loaded-value">
        <TextShimmer text={name} active={!tool.done} />
      </span>
      <span data-slot="tool-loaded-kind">{kind}</span>
    </div>
  );
}

function SubagentCard({
  tool,
  onOpenSession,
  runningSubagents,
}: {
  tool: ToolRun;
  onOpenSession?: (id: string) => void;
  runningSubagents?: ReadonlySet<string>;
}) {
  const tr = useT();
  const args = parseArgs(tool.arguments);
  const title = toolTitle(tool, args);
  const sessionID = subagentSessionID(tool);
  const description = stringArg(args, "description");
  const background = args.background === true || tool.metadata?.background === true;
  const subtitle = description || sessionID || "";
  const clickable = Boolean(sessionID && onOpenSession);
  const delegating = !tool.done && !sessionID && !tool.output;
  const running = !tool.done || Boolean(sessionID && runningSubagents?.has(sessionID));
  const state = delegating ? "delegating" : running ? (background ? "background" : "running") : "completed";

  if (delegating) {
    return (
      <div data-component="task-tool-delegating" data-state="delegating">
        <ActivityRing size={16} />
        <span>{tr("toolDelegating")}</span>
      </div>
    );
  }

  const open = () => {
    if (sessionID) onOpenSession?.(sessionID);
  };

  return (
    <div data-entry="subagent" data-state={state} data-background={background ? "true" : undefined} className="w-full min-w-0 transition-colors duration-200 motion-reduce:transition-none">
      <BasicTool
        id={`subagent:${tool.id}`}
        hideDetails
        clickable={clickable}
        onTriggerClick={open}
        ariaLabel={clickable ? tr("toolOpenSession", { name: title }) : undefined}
        trigger={
          <div data-component="task-tool-card">
            <div data-component="task-tool-surface">
              <div data-slot="basic-tool-tool-info-structured">
                <div data-slot="basic-tool-tool-info-main">
                  {running && <ActivityRing size={16} />}
                  <span data-component="task-tool-title">{title}</span>
                  {subtitle && <span data-slot="basic-tool-tool-subtitle">{subtitle}</span>}
                </div>
                {clickable && (
                  <div data-component="task-tool-action">
                    <ChevronRight className="size-4" />
                  </div>
                )}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}

function GenericTool({ tool }: { tool: ToolRun }) {
  const tr = useT();
  const args = parseArgs(tool.arguments);
  const label = toolSubtitle(tool, args);
  const rawName =
    typeof tool.metadata?.mcpTool === "string" && tool.metadata.mcpTool ? tool.metadata.mcpTool : tool.name;
  return (
    <BasicTool
      id={`generic:${tool.id}`}
      title={tr("toolCalled", { name: rawName })}
      subtitle={label}
      args={genericArgs(args)}
      pending={!tool.done}
    />
  );
}

function ToolDisplay({
  tool,
  detail,
  groupKey,
  onOpenSession,
  workspace,
  runningSubagents,
  shellOutput,
  summaryOnly,
}: {
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
  if (tool.cancelled) {
    return (
      <div data-component="tool-cancelled" className="flex w-full items-center gap-2">
        <span className="text-meta leading-4 text-text-faint">{toolName(tool.name)}</span>
        <span className="text-meta leading-4 text-text-faint">·</span>
        <span className="text-meta leading-4 text-text-faint">{tr("toolCancelled")}</span>
      </div>
    );
  }

  if (tool.name === "execute") {
    return <ExecuteTool tool={tool} />;
  }

  if (tool.failed && tool.name === "question" && /dismissed this question/i.test(tool.output ?? "")) {
    return (
      <div className="flex w-full justify-end">
        <span className="text-meta leading-4 text-text-faint">{tr("toolDismissed")}</span>
      </div>
    );
  }

  if (tool.failed) {
    const taskID = tool.name === "subagent" ? subagentSessionID(tool) : undefined;
    const exit = tool.metadata?.exit;
    const errorText =
      tool.output ||
      (typeof exit === "number" && exit !== 0
        ? tr("toolCommandExited", { code: exit })
        : tr("toolFailureGeneric"));
    return (
      <ToolErrorCard
        tool={tool.name}
        error={errorText}
        title={tool.name === "websearch" ? webProviderLabel(tool) : undefined}
        subtitle={taskID ? stringArg(parseArgs(tool.arguments), "description") || taskID : toolSubtitle(tool)}
        id={tool.id}
        onSubtitleClick={taskID && onOpenSession ? () => onOpenSession(taskID) : undefined}
      />
    );
  }

  if (tool.name === "question" && !tool.done) return null;

  let content: ReactNode = null;
  switch (tool.name) {
    case "read":
      content = <ReadTool tool={tool} workspace={workspace} />;
      break;
    case "list":
      content = <ListTool tool={tool} summaryOnly={summaryOnly} />;
      break;
    case "glob":
    case "grep":
      content = <SearchTool tool={tool} summaryOnly={summaryOnly} />;
      break;
    case "webfetch":
      content = <WebfetchTool tool={tool} />;
      break;
    case "websearch":
      content = <WebsearchTool tool={tool} />;
      break;
    case "shell":
      content = (
        <ShellTool
          tool={tool}
          defaultOpen={detail.shell.details === "expanded"}
          shellOutput={shellOutput?.(tool)}
        />
      );
      break;
    case "edit":
    case "write":
    case "patch":
    case "apply_patch":
      content = summaryOnly ? (
        <BasicTool
          id={`${tool.name}:${tool.id}`}
          title={toolTitle(tool)}
          subtitle={toolSubtitle(tool)}
          pending={!tool.done}
        />
      ) : (
        <FileGroup
          tools={[tool]}
          detail={detail}
          groupKey={groupKey}
          showHeader={tool.name === "edit"}
        />
      );
      break;
    case "subagent":
      content = (
        <SubagentCard tool={tool} onOpenSession={onOpenSession} runningSubagents={runningSubagents} />
      );
      break;
    case "question":
      content = <QuestionTool tool={tool} />;
      break;
    case "skill":
      content = <SkillTool tool={tool} />;
      break;
    default:
      content = <GenericTool tool={tool} />;
  }

  return (
    <div data-component="tool-part-wrapper" data-timeline-part-id={tool.id}>
      {content}
    </div>
  );
}

function groupParts(parts: ContextPart[]) {
  const items: (
    | { kind: "read"; tools: ToolRun[] }
    | { kind: "files"; tools: ToolRun[] }
    | { kind: "skills"; tools: ToolRun[] }
    | { kind: "part"; part: ContextPart }
  )[] = [];

  for (const part of parts) {
    if (part.kind !== "tool") {
      items.push({ kind: "part", part });
      continue;
    }
    const tool = part.tool;
    // Loaded instruction files and images keep their own rows, as the reference does.
    const groupedRead =
      !tool.failed && tool.name === "read" && !isImageRead(tool) && loadedPaths(tool).length === 0;
    const kind = groupedRead
      ? "read"
      : !tool.failed && isFileTool(tool.name)
        ? "files"
        : !tool.failed && tool.name === "skill"
          ? "skills"
          : undefined;

    if (!kind) {
      items.push({ kind: "part", part });
      continue;
    }

    const previous = items[items.length - 1];
    if (previous && previous.kind === kind) previous.tools.push(tool);
    else items.push({ kind, tools: [tool] });
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
function GroupedNotice({ entry }: { entry: TimelineEntry }) {
  const tr = useT();
  const text = entry.notice ? noticeText(entry.notice, tr) : (entry.text ?? "");
  if (!text) return null;
  return (
    <div data-slot="session-timeline-notice" className="w-full truncate py-1 text-body leading-5 text-text-faint">
      {text}
    </div>
  );
}

/** Instruction files loaded during the turn. */
export function LoadedRow({ paths }: { paths: string[] }) {
  const tr = useT();
  return (
    <div data-component="tool-loaded-item" aria-label={`${tr("toolLoaded")} ${paths.join(", ")}`}>
      <span data-slot="tool-loaded-label">{tr("toolLoaded")}</span>
      <span data-slot="tool-loaded-value">{paths.join(", ")}</span>
    </div>
  );
}

/** An instruction load folded into a group, matching its standalone row. */
function GroupedLoaded({ entry }: { entry: TimelineEntry }) {
  if (!entry.loaded?.length) return null;
  return <LoadedRow paths={entry.loaded} />;
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

export function ToolBlock({
  parts,
  busy,
  detail: detailValue,
  onOpenFile,
  onOpenSession,
  workspace,
  runningSubagents,
  shellOutput,
}: {
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
  const detail = timelineDetail(detailValue);
  const visible = useMemo(() => parts, [parts]);
  const tools = useMemo(
    () => visible.flatMap((part) => (part.kind === "tool" ? [part.tool] : [])),
    [visible],
  );
  const shells = useMemo(
    () => visible.flatMap((part) => (part.kind === "shell" ? [part] : [])),
    [visible],
  );
  const reasoning = useMemo(
    () => visible.flatMap((part) => (part.kind === "reasoning" ? [part] : [])),
    [visible],
  );
  const liveReasoning = reasoning.some((part) => part.entry.live);
  // A finished thought is no longer "Thinking"; the next live turn phase owns
  // that label instead of every busy group.
  const thinking = reasoning.length > 0 && reasoning.length === visible.length && liveReasoning;
  const first = visible[0];
  // Commentary can join ahead of the tools and later leave, so it never anchors
  // the block. The first non-text part does, but a reasoning or notice entry key
  // is rebuilt when the finished turn is reloaded from history. A tool keeps the
  // call id it was streamed with, so it is the one identity that survives that
  // reload; keep the anchor as an alias for blocks that never held a tool.
  const anchor = visible.find((part) => part.kind !== "text") ?? first;
  const anchorKey = anchor ? (anchor.kind === "tool" ? anchor.tool.id : anchor.entry.key) : "context";
  const key = tools[0]?.id ?? anchorKey;
  const disclosureKeys =
    key === anchorKey ? [`group:${key}`] : [`group:${key}`, `group:${anchorKey}`];
  const [open, setOpen] = useDisclosure(disclosureKeys);
  const root = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  const pending = Boolean(busy) || tools.some((tool) => !tool.done);

  const change = (next: boolean) => {
    // Collapsing from a stuck header would leave the viewport below the group;
    // keep the header in place by scrolling before the shorter content clamps.
    if (!next && root.current) {
      const trigger = root.current.querySelector<HTMLElement>(
        ':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]',
      );
      const stuck = trigger
        ? trigger.getBoundingClientRect().top - root.current.getBoundingClientRect().top
        : 0;
      if (stuck > 0) scrollParent(root.current)?.scrollBy?.({ top: -stuck, behavior: "instant" });
    }
    setOpen(next);
  };

  useEffect(() => {
    if (!thinking) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [thinking]);

  const names = useMemo(() => {
    const labels = unique([
      ...tools.map((tool) =>
        tool.name === "subagent"
          ? toolName("subagent")
          : tool.name === "websearch"
            ? webProviderLabel(tool)
            : toolTitle(tool),
      ),
      ...(shells.length ? [tr("toolShell")] : []),
    ]);
    // Code Mode callers scan for this row; keep it at the front when the summary
    // is clipped to one line in a narrow transcript.
    const executeLabel = tr("toolExecute");
    labels.sort((a, b) => Number(b === executeLabel) - Number(a === executeLabel));
    return labels;
  }, [tools, shells, tr]);
  const count = tools.length + shells.length || reasoning.length;
  const title =
    names.join(", ") ||
    (reasoning.length > 0
      ? reasoning.length === 1
        ? tr("toolThought")
        : tr("toolThoughts")
      : tr("toolUpdates"));
  const label = thinking ? tr("toolThinking") : title;
  const elapsed = thinking ? thinkingElapsed(visible, now) : "";
  const showCount = !thinking && count > 0;

  if (visible.length === 0) return null;

  const items = groupParts(visible);

  const countText = `${tr("toolUsed")} ${count} ${tr("toolUsedBetween")}${tr("toolUsedBetween") ? " " : ""}${title}`;

  return (
    <div
      ref={root}
      data-component="collapsed-tool-group"
      data-notices-only={visible.every((part) => part.kind === "notice" || part.kind === "loaded") ? "" : undefined}
      data-timeline-part-ids={visible.map((part) => (part.kind === "tool" ? part.tool.id : part.entry.key)).join(",")}
    >
      <BasicTool
        id={`group:${key}`}
        compact
        hasContent
        open={open}
        onOpenChange={change}
        status={pending ? "running" : "completed"}
        allowOpenWhilePending
        ariaLabel={thinking ? tr("toolThinking") : showCount ? countText : title}
        trigger={
          <div data-component="context-tool-group-trigger">
            <span data-slot="context-tool-group-title">
              {showCount && (
                <span data-slot="context-tool-group-usage">
                  <span data-slot="context-tool-group-prefix">{tr("toolUsed")}</span>
                  <AnimatedNumber value={count} />
                  {tr("toolUsedBetween") && (
                    <span data-slot="context-tool-group-prefix">{tr("toolUsedBetween")}</span>
                  )}
                </span>
              )}
              <span data-slot="basic-tool-tool-title" title={label}>
                <TextShimmer text={label} active={thinking} />
              </span>
              {elapsed && <span data-slot="basic-tool-tool-subtitle">{elapsed}</span>}
            </span>
          </div>
        }
      >
        <div data-component="context-tool-group-list">
          {items.map((item, index) => {
            let content: ReactNode;
            let itemKey: string;
            if (item.kind === "read") {
              itemKey = `read-${index}`;
              content = <ReadGroup tools={item.tools} groupKey={`${key}:read-${index}`} />;
            } else if (item.kind === "files") {
              itemKey = `files-${index}`;
              content = <FileGroup tools={item.tools} detail={detail} groupKey={`${key}:files-${index}`} />;
            } else if (item.kind === "skills") {
              itemKey = `skills-${index}`;
              content = <SkillGroup tools={item.tools} />;
            } else {
              const part = item.part;
              itemKey = part.kind === "tool" ? part.tool.id : part.entry.key;
              if (part.kind === "reasoning") {
                content = <ReasoningRow entry={part.entry} detail={detail} insideGroup autoOpen={thinking} />;
              } else if (part.kind === "shell") {
                content = <SessionShellMessage shell={part.entry.shell!} entryKey={part.entry.key} detail={detail} />;
              } else if (part.kind === "notice") {
                content = <GroupedNotice entry={part.entry} />;
              } else if (part.kind === "loaded") {
                content = <GroupedLoaded entry={part.entry} />;
              } else if (part.kind === "text") {
                content = <Markdown text={part.entry.text ?? ""} />;
              } else {
                content = (
                  <ToolDisplay
                    tool={part.tool}
                    detail={detail}
                    groupKey={key}
                    onOpenSession={onOpenSession}
                    workspace={workspace}
                    runningSubagents={runningSubagents}
                    shellOutput={shellOutput}
                    summaryOnly
                  />
                );
              }
            }
            return (
              <div key={itemKey} data-slot="context-tool-group-item">
                {content}
              </div>
            );
          })}
        </div>
      </BasicTool>
    </div>
  );
}

/** Standalone tools keep their full detail row and content outside a group. */
export function ToolStandalone({
  tool,
  detail: detailValue,
  onOpenSession,
  workspace,
  runningSubagents,
  shellOutput,
}: {
  tool: ToolRun;
  detail?: TimelineDetailInput;
  onOpenSession?: (sessionID: string) => void;
  workspace?: string;
  runningSubagents?: ReadonlySet<string>;
  shellOutput?: (tool: ToolRun) => ShellOutputSource | undefined;
}) {
  const detail = timelineDetail(detailValue);
  return (
    <div data-entry="tool">
      <ToolDisplay
        tool={tool}
        detail={detail}
        groupKey={`standalone:${tool.id}`}
        onOpenSession={onOpenSession}
        workspace={workspace}
        runningSubagents={runningSubagents}
        shellOutput={shellOutput}
      />
    </div>
  );
}

/** Provider reasoning folded into a single row; live text shimmers. */
export function ReasoningRow({
  entry,
  detail: detailValue,
  insideGroup,
  autoOpen,
}: {
  entry: TimelineEntry;
  detail?: TimelineDetailInput;
  insideGroup?: boolean;
  /** The group already reads as Thinking, so opening it shows the thoughts themselves. */
  autoOpen?: boolean;
}) {
  const tr = useT();
  const detail = timelineDetail(detailValue);
  const text = entry.text ?? "";
  const live = entry.live;
  const duration = reasoningDuration(entry.created, entry.endedAt);
  const heading = live ? reasoningHeading(text) : undefined;
  const label = live ? tr("toolThinking") : tr("toolThought");
  const hasText = Boolean(text.trim());

  return (
    <div data-component="reasoning-part" data-entry="reasoning">
      <BasicTool
        id={`reasoning:${entry.key}`}
        compact
        hasContent={hasText}
        status={live ? "running" : "completed"}
        allowOpenWhilePending
        hideDetails={!hasText}
        defaultOpen={Boolean(autoOpen) || detail.thinking.details === "expanded"}
        trigger={(open) => (
          <div data-slot="basic-tool-tool-info-structured">
            <div data-slot="basic-tool-tool-info-main">
              <span data-slot="basic-tool-tool-title">
                <TextShimmer text={label} active={live} />
              </span>
              {live && !open && heading && <span data-slot="basic-tool-tool-subtitle">{heading}</span>}
              {!live && duration && <span data-slot="basic-tool-tool-subtitle">{duration}</span>}
            </div>
          </div>
        )}
      >
        <Markdown text={text} className="reasoning-markdown" />
      </BasicTool>
    </div>
  );
}



