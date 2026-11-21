import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  type Accessor,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { createReducer } from "@lingzhu/ui/solid";
import { ArrowDown, Ban, ChevronDown, Copy, GitFork, History, Image as ImageIcon, MessageSquare, RotateCcw, Search, TriangleAlert, X } from "@lingzhu/ui/icons";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { LinkedText } from "@lingzhu/ui/LinkedText";
import { TextShimmer } from "@lingzhu/ui/TextShimmer";
import { CopyButton, Markdown } from "./Markdown";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { FileGroup, LoadedRow, ReadGroup, ReasoningRow, SessionShellMessage, ToolBlock, ToolStandalone } from "./ToolPart";
import { ToolScopeProvider } from "./disclosure";
import type { ShellOutputSource } from "./ToolPart";
import { attachmentContextLabel, attachmentName, attachmentTypeLabel } from "@lingzhu/ui/attachments";
import { timelineRows, type TimelineRow, type TurnTotals } from "@lingzhu/session-ui/timeline";
import { timelineStatus, type TimelineStatus } from "@lingzhu/session-ui/status";
import { instructionSourceLabels, noticeLabel } from "@lingzhu/session-ui/notice";
import { MessageNav, messageNavItems } from "@lingzhu/session-ui/MessageNav";
import { createTimelineVirtualizer } from "@lingzhu/session-ui/timeline-virtual";
import {
  GRACE_ELAPSED_EVENT,
  createCompactionEntranceState,
  selectCompactionEnter,
  transitionCompactionEntrance,
} from "@lingzhu/session-ui/compaction-entrance";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@lingzhu/ui/dialog";
import type { ChatState, EntryAttachment, MessageSwitch, PromptComment, TimelineDetailInput, TimelineEntry, ToolRun, TurnUsage } from "@lingzhu/ui/types";
import { capitalize } from "@lingzhu/ui/text";
import { t, useT } from "@lingzhu/ui/i18n";
import { formatDuration, formatMessageTime } from "@lingzhu/ui/format";
import { cn } from "@lingzhu/ui/utils";

interface SourceItem {
  title: string;
  url: string;
}

function sourceTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Web pages a turn searched or fetched, deduplicated by URL. */
function turnSources(rows: TimelineRow[], index: number): SourceItem[] {
  let start = index;
  while (start > 0 && rows[start - 1].entry?.role !== "user") start -= 1;
  let end = index + 1;
  while (end < rows.length && rows[end].entry?.role !== "user") end += 1;
  const found = new Map<string, SourceItem>();
  const add = (url: string) => {
    const clean = url.replace(/[),.;:!?]+$/, "");
    if (!/^https?:\/\//i.test(clean) || found.has(clean)) return;
    found.set(clean, { title: sourceTitle(clean), url: clean });
  };
  const tools: ToolRun[] = [];
  for (const row of rows.slice(start, end)) {
    if (row.tool) tools.push(row.tool);
    if (row.read) tools.push(...row.read);
    if (row.files) tools.push(...row.files);
    if (row.parts) {
      for (const part of row.parts) if (part.kind === "tool") tools.push(part.tool);
    }
  }
  for (const tool of tools) {
    if (tool.name === "webfetch") {
      try {
        const args = JSON.parse(tool.arguments || "{}") as { url?: unknown };
        if (typeof args.url === "string") add(args.url);
      } catch {}
      continue;
    }
    if (tool.name !== "websearch") continue;
    for (const match of tool.output?.match(/https?:\/\/[^\s<>"'`)\]]+/g) ?? []) add(match);
  }
  return [...found.values()].slice(0, 12);
}


/**
 * A lightweight spring for the user-run fold. The reference animates the meta
 * line and joined bubble corners with a spring; CSS transitions alone cannot
 * overshoot, so this drives the numeric pose directly.
 */
function useSpring(target: Accessor<number>) {
  const [value, setValue] = createSignal(target());
  let current = target();
  let velocity = 0;

  createEffect(() => {
    const goal = target();
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      const force = -180 * (current - goal) - 26 * velocity;
      velocity += force * dt;
      current += velocity * dt;
      if (Math.abs(current - goal) < 0.001 && Math.abs(velocity) < 0.001) {
        current = goal;
        setValue(goal);
        return;
      }
      setValue(current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  return value;
}

/** One transcript row, kept mounted by key so a streamed update flows into it. */
interface RowItem {
  key: string;
  row: Accessor<TimelineRow>;
  index: Accessor<number>;
  start: Accessor<number>;
  setRow: (row: TimelineRow) => void;
  setIndex: (index: number) => void;
  setStart: (start: number) => void;
}

function createRowItem(row: TimelineRow, index: number, start: number): RowItem {
  const [current, setRow] = createSignal(row);
  const [position, setIndex] = createSignal(index);
  const [top, setStart] = createSignal(start);
  return { key: row.key, row: current, index: position, start: top, setRow, setIndex, setStart };
}

export function Messages(props: {
  chat: ChatState;
  /** Workspace root used to shorten absolute tool paths. */
  workspace?: string;
  /** Child sessions still running, so their launch cards keep the activity ring. */
  runningSubagents?: ReadonlySet<string>;
  /** Streams a background shell's captured output while it runs. */
  shellOutput?: (tool: ToolRun) => ShellOutputSource | undefined;
  /** Height of the floating composer dock, reserved below the transcript. */
  bottomInset?: number;
  /** Reveals another page of older transcript entries. */
  onLoadOlder?: () => void;
  /** Sticky identity header rendered inside the scrollport, as the reference does. */
  header?: JSX.Element;
  modelLabel?: string;
  /** Resolves a historical user turn's model id to its display name. */
  modelName?: (provider: string, model: string) => string;
  onReview?: () => void;
  onOpenFile?: (path: string) => void;
  /** Opens a subagent child session from its task card. */
  onOpenSession?: (sessionID: string) => void;
  onQuote?: (text: string) => void;
  /** Reverts the latest user turn and returns its prompt to the composer. */
  onUndo?: (text: string) => void;
  /** Opens the turn picker for an earlier user message. */
  onRevert?: (text: string, created?: string) => void;
  /** Starts a new session with the history before this prompt. */
  onFork?: (text: string) => void;
  canUndo?: boolean;
  detail?: TimelineDetailInput;
  /** Fold long user prompts behind Read more. */
  foldLongMessages?: boolean;
  /** Show the changed-files summary under each turn. */
  showTurnDiffs?: boolean;
  /** Show the agent name in message footers, as the reference's Show agent setting does. */
  showAgent?: boolean;
  /** Closes a tab whose session the core no longer has. */
  onCloseMissing?: () => void;
}) {
  let container: HTMLDivElement | undefined;
  let pinned = true;
  // The last observed offset, so growth below the viewport is not mistaken for
  // the reader scrolling up.
  let lastScrollTop = 0;
  const [awayFromBottom, setAwayFromBottom] = createSignal(false);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [hit, setHit] = createSignal(0);
  const [occurrences, setOccurrences] = createSignal(0);
  let input: HTMLInputElement | undefined;
  const [measureTick, bumpMeasure] = createReducer<number, void>((value) => value + 1, 0);

  // Reads that only change with the transcript itself are funnelled through
  // memos, so a burst of streamed updates does not re-run the scroll effects.
  const chatId = createMemo(() => props.chat.id);
  const entries = createMemo(() => props.chat.entries);
  const running = createMemo(() => props.chat.running);
  const loading = createMemo(() => props.chat.loading);
  const detailInput = createMemo<TimelineDetailInput>(() => props.detail ?? "compact");

  // Sticky tool headers must stop below the session header instead of sliding
  // under it. The height is a theme token, so changing the header does not
  // leave a stale hard-coded inset behind.
  const headerInset = () => (props.header ? "var(--session-header-height, 48px)" : "0px");

  // A `#message-<id>` hash reveals that prompt once the rows exist, and the
  // transcript keeps its own scroll position when the browser would restore one.
  let revealed: string | undefined;
  createEffect(() => {
    void entries().length;
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    const reveal = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#message-")) return;
      const id = decodeURIComponent(hash.slice("#message-".length));
      if (!id || revealed === id) return;
      const target = container?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if (!target) return;
      revealed = id;
      target.scrollIntoView({ block: "start" });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    onCleanup(() => window.removeEventListener("hashchange", reveal));
  });

  const scrollToEnd = () => {
    const element = container;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  };

  // Switching sessions starts at the newest content, never at the previous
  // session's scroll offset.
  createEffect(() => {
    void chatId();
    pinned = true;
    setAwayFromBottom(false);
    setSearchOpen(false);
    setQuery("");
    setHit(0);
    scrollToEnd();
  });

  // Mod+F opens the transcript find bar, as in the reference timeline.
  onMount(() => {
    const onFind = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      setSearchOpen(true);
      window.setTimeout(() => {
        input?.focus();
        input?.select();
      });
    };
    window.addEventListener("keydown", onFind);
    onCleanup(() => window.removeEventListener("keydown", onFind));
  });

  createEffect(() => {
    if (searchOpen()) {
      input?.focus();
      return;
    }
    setQuery("");
    setHit(0);
  });

  // Following is a plain flag, as in the reference: the reader's own upward
  // input detaches at the moment it happens, and only arriving at the end
  // reattaches. A time window would misread a fast scroll back to the end.
  createEffect(() => {
    if (running()) return;
    const element = container;
    if (!element) return;
    const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight <= 1;
    if (atEnd) {
      pinned = true;
      setAwayFromBottom(false);
    }
  });

  createEffect(() => {
    void entries();
    if (pinned) scrollToEnd();
  });

  // History arrives after the first paint; pin again once it is rendered.
  createEffect(() => {
    if (loading()) return;
    if (pinned) scrollToEnd();
  });

  // The composer grows with its content; keeping the bottom pinned on container
  // resizes prevents the last message from jumping out of view while typing.
  onMount(() => {
    const element = container;
    if (!element) return;
    const measure = () => {
      if (pinned) element.scrollTop = element.scrollHeight;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  // The reader's own input detaches immediately, at the moment it happens.
  // Waiting for the resulting scroll event races the stream: an entry that
  // arrives between the wheel and the scroll would scroll back to the end
  // first, and the reader would be dragged down.
  const detach = () => {
    pinned = false;
    setAwayFromBottom(true);
  };
  onMount(() => {
    const element = container;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) detach();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home") detach();
    };
    // Dragging the content downward reveals earlier messages.
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY;
      if (y > touchY) detach();
      touchY = y;
    };

    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("keydown", onKey);
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    onCleanup(() => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("keydown", onKey);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
    });
  });

  const onScroll = () => {
    const element = container;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    // Arriving at the end always reattaches, whatever the reader did before:
    // they asked to see the newest content.
    if (distance <= 1) {
      pinned = true;
      setAwayFromBottom(false);
      return;
    }
    // The wheel handler already detached. Here, only an actual upward move
    // counts: growth below the viewport raises `scrollHeight` without moving
    // `scrollTop`, and that must not stop following.
    if (element.scrollTop < lastScrollTop - 0.5) detach();
    lastScrollTop = element.scrollTop;
  };

  // PageUp/PageDown move 80% of the visible area, measured above the floating
  // composer, as the reference timeline does.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    const element = container;
    if (!element) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (target?.isContentEditable) return;
    event.preventDefault();
    const page = Math.max(0, element.clientHeight - (props.bottomInset ?? 0));
    const delta = (event.key === "PageDown" ? 1 : -1) * page * 0.8;
    // `scrollBy` is missing in jsdom; assigning scrollTop keeps the same result.
    if (typeof element.scrollBy === "function") element.scrollBy({ top: delta, behavior: "instant" });
    else element.scrollTop += delta;
  };

  const toBottom = () => {
    const element = container;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    pinned = true;
    setAwayFromBottom(false);
  };

  /** Jumps to one prompt, whichever row the transcript currently mounts. */
  const jumpToMessage = (key: string) => {
    const element = container;
    if (!element) return;
    pinned = false;
    setAwayFromBottom(true);
    const target = element.querySelector<HTMLElement>(`[data-message-id="${key}"]`);
    if (target) {
      target.scrollIntoView({ block: "start" });
      return;
    }
    // Virtualized rows that are outside the window are not in the DOM; fall
    // back to the hash reveal path, which re-runs once rows exist.
    window.location.hash = `#message-${encodeURIComponent(key)}`;
  };

  const empty = createMemo(() => entries().length === 0);
  // The status row belongs to the whole turn. Hiding it whenever text streamed
  // made it blink in and out at every phase change (first token, tool call,
  // reasoning), so it now stays for as long as the turn is running.
  const working = running;
  // What the line says: a permission or question outranks the running call.
  const pendingCount = createMemo(() => props.chat.pending.length);
  const questionCount = createMemo(() => props.chat.questions.length);
  const status = createMemo(() =>
    timelineStatus({
      blocked: pendingCount() > 0 ? "approval" : questionCount() > 0 ? "answer" : undefined,
      entries: entries(),
    }),
  );
  // The projection only changes with the transcript itself. The virtualizer
  // re-renders this component on every scroll frame, so rebuilding the rows
  // (and the diff tallies the navigator derives from them) would otherwise run
  // on each one.
  const projectedRows = createMemo(() =>
    timelineRows(entries(), detailInput(), {
      running: running(),
      showTurnDiffs: props.showTurnDiffs ?? true,
      retry: props.chat.retry,
      error: props.chat.error,
    }),
  );
  // A fresh projection allocates every row object, which would defeat the row
  // memo. Rows whose payload is unchanged keep the object they had, so only the
  // streaming row reaches the renderer.
  let rowCache = new Map<string, TimelineRow>();
  let rowCacheOwner = "";
  const allRows = createMemo(() => {
    // Row keys are only unique within one session; a switch starts fresh so a
    // row from the previous transcript can never be reused.
    const previous = rowCacheOwner === chatId() ? rowCache : new Map<string, TimelineRow>();
    rowCacheOwner = chatId();
    const next = new Map<string, TimelineRow>();
    const stable = projectedRows().map((row) => {
      const prior = previous.get(row.key);
      const kept = prior && sameRowPayload(prior, row) ? prior : row;
      next.set(row.key, kept);
      return kept;
    });
    rowCache = next;
    return stable;
  });
  // Older history is folded behind a reveal row at the top; the newest page is
  // always mounted, matching the reference's near-top paging.
  const historyLimit = createMemo(() => props.chat.historyLimit ?? 0);
  const hiddenRows = createMemo(() => (historyLimit() > 0 ? Math.max(0, allRows().length - historyLimit()) : 0));
  const rows = createMemo(() => {
    const hidden = hiddenRows();
    const all = allRows();
    return hidden > 0 ? all.slice(hidden) : all;
  });
  const lastUserIndex = createMemo(() =>
    rows().reduce((last, row, index) => (row.entry?.role === "user" ? index : last), -1),
  );
  // The reference marks a turn's last assistant part as busy, so its summary
  // block reads as working until the turn moves past it. Tracking the last
  // group alone would keep shimmering under a reply that already followed it.
  const lastAssistantPartRow = createMemo(() =>
    rows().reduce((last, row, index) => {
      const assistantPart =
        row.parts ||
        row.read ||
        row.files ||
        row.tool ||
        row.entry?.role === "assistant" ||
        row.entry?.role === "reasoning";
      return assistantPart ? index : last;
    }, -1),
  );
  const busyContextRow = createMemo(() => (running() && rows()[lastAssistantPartRow()]?.parts ? lastAssistantPartRow() : -1));
  // The navigator lists prompts only, so a turn's ticks line up with the
  // scroll targets the hash reveal and `jumpToMessage` already use. It tallies
  // every turn's diff, so it is rebuilt only when the rows change.
  const navItems = createMemo(() => messageNavItems(rows()));
  const navCurrent = createMemo(() => {
    const index = lastUserIndex();
    return index >= 0 ? rows()[index]?.entry?.key : undefined;
  });
  const isAssistantRow = (row: TimelineRow) =>
    Boolean(
      row.diff ||
        row.parts ||
        row.read ||
        row.files ||
        row.tool ||
        row.entry?.role === "reasoning" ||
        row.entry?.role === "assistant" ||
        row.entry?.role === "notice" ||
        row.entry?.role === "loaded",
    );
  const isToolLikeRow = (row: TimelineRow) =>
    Boolean(
      row.diff ||
        row.parts ||
        row.read ||
        row.files ||
        row.tool ||
        row.entry?.role === "reasoning" ||
        row.entry?.role === "shell" ||
        // A separate notice is a status line about a tool run, so the next tool
        // block keeps the tight tool gap instead of the 16px content gap that
        // would read as a divider between two groups.
        row.entry?.role === "notice",
    );
  const spacing = createMemo(() => {
    const list = rows();
    const spacingFor = (row: TimelineRow, index: number) => {
      if (row.retry) return index === 0 ? "" : "pt-3";
      if (row.error) return index === 0 ? "" : "pt-6";
      if (row.divider) return index === 0 ? "" : "pt-2";
      if (!isAssistantRow(row) || index === 0) return "";
      // A separate thinking row sits 12px under its prompt, as the reference does.
      if (row.entry?.role === "reasoning") return "pt-3";
      const previous = list[index - 1];
      if (!previous) return "";
      // The reference gives the first assistant content 24px under its prompt,
      // 8px after a tool group and 16px after earlier content.
      if (previous.entry?.role === "user") return "pt-6";
      return isToolLikeRow(previous) ? "pt-2" : "pt-4";
    };
    return list.map(spacingFor);
  });
  const spacingFor = (row: TimelineRow, index: number) => spacing()[index] ?? "";
  const needle = createMemo(() => query().trim().toLowerCase());
  // Searching scans every row's text, including tool output, so it is redone
  // only when the term or the rows change rather than on each render.
  const hits = createMemo(() => {
    const term = needle();
    return term
      ? rows()
          .filter((row) => rowSearchText(row).toLowerCase().includes(term))
          .map((row) => row.key)
      : [];
  });

  // Every occurrence is highlighted through the CSS Custom Highlight API, with
  // the active match in its own registry, so the transcript is not re-rendered.
  createEffect(() => {
    const open = searchOpen();
    const term = needle();
    const activeHit = hit();
    void entries();
    void rows().length;
    const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
    const root = container;
    if (!registry || !root) return;
    registry.delete("timeline-search");
    registry.delete("timeline-search-active");
    if (!open || !term) {
      setOccurrences(0);
      return;
    }

    const HighlightCtor = (globalThis as { Highlight?: new () => object }).Highlight;
    if (!HighlightCtor) {
      // jsdom has no Highlight; the count still reflects real occurrences.
      const total = occurrencesIn(root, term);
      setOccurrences(total);
      return;
    }
    const all = new HighlightCtor() as { add: (range: Range) => void; size?: number };
    const active = new HighlightCtor() as { add: (range: Range) => void; size?: number };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let index = 0;
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent ?? "").toLowerCase();
      let at = text.indexOf(term);
      while (at >= 0) {
        const range = new Range();
        range.setStart(node, at);
        range.setEnd(node, at + term.length);
        if (index === activeHit) active.add(range);
        all.add(range);
        index += 1;
        at = text.indexOf(term, at + term.length);
      }
      node = walker.nextNode();
    }
    if (index > 0) {
      registry.set("timeline-search", all as never);
      if ((active.size ?? 0) > 0) registry.set("timeline-search-active", active as never);
    }
    setOccurrences(index);
    onCleanup(() => {
      registry.delete("timeline-search");
      registry.delete("timeline-search-active");
    });
  });

  // Long transcripts mount only the rows near the viewport; the vendored
  // TanStack core owns absolute placement, measurement and scroll anchoring.
  // Find keeps the same engine so matches never remount the transcript. A short
  // transcript stays fully mounted: the "Load older" reveal needs every row in
  // the DOM, and mounting a handful costs less than the engine's bookkeeping.
  const virtual = createMemo(() => rows().length > 60);
  const rowKeys = createMemo(() => rows().map((row) => row.key));
  const engine = createTimelineVirtualizer({
    count: () => rows().length,
    getScrollElement: () => container ?? null,
    getItemKey: (index) => rowKeys()[index] ?? String(index),
    onChange: () => bumpMeasure(),
  });

  createEffect(() => {
    const isVirtual = virtual();
    void rows().length;
    if (isVirtual && pinned) engine.scrollToEnd();
  });

  const virtualItems = createMemo(() => {
    measureTick();
    return virtual() ? engine.getVirtualItems() : [];
  });
  const totalSize = createMemo(() => {
    measureTick();
    return engine.getTotalSize();
  });

  // Rows keep their identity by key, so a streamed update replaces the row
  // object under the same element instead of remounting the subtree.
  let rowItemCache = new Map<string, RowItem>();
  const rowItems = createMemo<RowItem[]>(() => {
    const list = rows();
    const next: RowItem[] = [];
    const cache = new Map<string, RowItem>();
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      let item = rowItemCache.get(row.key);
      if (item) {
        item.setRow(row);
        item.setIndex(index);
      } else {
        item = createRowItem(row, index, 0);
      }
      next.push(item);
      cache.set(row.key, item);
    }
    rowItemCache = cache;
    return next;
  });
  const windowRows = createMemo<RowItem[]>(() => {
    const list = rows();
    const next: RowItem[] = [];
    const cache = new Map<string, RowItem>();
    for (const entry of virtualItems()) {
      const row = list[entry.index];
      if (!row) continue;
      let item = rowItemCache.get(row.key);
      if (item) {
        item.setRow(row);
        item.setIndex(entry.index);
        item.setStart(entry.start);
      } else {
        item = createRowItem(row, entry.index, entry.start);
      }
      next.push(item);
      cache.set(row.key, item);
    }
    rowItemCache = cache;
    return next;
  });

  // A hit scrolls into view; the CSS highlight marks every occurrence, with the
  // active one in its own registry.
  createEffect(() => {
    const open = searchOpen();
    const activeHit = hit();
    const hitsList = hits();
    void entries();
    if (!open || hitsList.length === 0) return;
    const key = hitsList[Math.min(activeHit, hitsList.length - 1)];
    const target = container?.querySelector<HTMLElement>(`[data-search-key="${key}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center" });
  });
  // Every finished turn's final assistant text carries its own footer, so a
  // later run never rewrites what an earlier turn measured.
  const turnFooterRows = createMemo(() => {
    const found = new Map<number, TurnUsage | undefined>();
    let lastInTurn = -1;
    let turn: TurnUsage | undefined;
    let turnRunning = false;
    rows().forEach((row, index) => {
      if (row.entry?.role === "user") {
        if (lastInTurn >= 0 && !turnRunning) found.set(lastInTurn, turn);
        lastInTurn = -1;
        turn = row.entry.turn;
        turnRunning = false;
        return;
      }
      if (row.entry?.role === "assistant" && row.entry.text) lastInTurn = index;
      if (row.retry || row.error) turnRunning = true;
    });
    const open = running() || Boolean(props.chat.retry) || Boolean(props.chat.error);
    if (lastInTurn >= 0 && !open) found.set(lastInTurn, turn);
    return found;
  });
  // A turn's sources scan its tool arguments and outputs, so they are collected
  // once per transcript instead of once per footer on every render.
  const sourcesByRow = createMemo(() => {
    const found = new Map<number, SourceItem[]>();
    const list = rows();
    for (const index of turnFooterRows().keys()) {
      const sources = turnSources(list, index);
      if (sources.length > 0) found.set(index, sources);
    }
    return found;
  });
  const renderRow = (row: Accessor<TimelineRow>, index: Accessor<number>) => (
    <TimelineRowView
      row={row()}
      busy={index() === busyContextRow()}
      runTop={row().entry?.role === "user" && joinsRun(rows()[index() - 1]?.entry, row().entry)}
      runBottom={row().entry?.role === "user" && joinsRun(row().entry, rows()[index() + 1]?.entry)}
      latest={index() === lastUserIndex()}
      footer={turnFooterRows().has(index())}
      sources={sourcesByRow().get(index())}
      detail={detailInput()}
      modelLabel={props.modelLabel}
      modelName={props.modelName}
      showAgent={props.showAgent}
      canUndo={props.canUndo}
      foldLongMessages={props.foldLongMessages}
      running={running()}
      lastRunStatus={props.chat.lastRunStatus}
      turn={turnFooterRows().get(index())}
      workspace={props.workspace}
      runningSubagents={props.runningSubagents}
      shellOutput={props.shellOutput}
      onReview={props.onReview}
      onOpenFile={props.onOpenFile}
      onOpenSession={props.onOpenSession}
      onUndo={props.onUndo}
      onRevert={props.onRevert}
      onFork={props.onFork}
    />
  );

  return (
    <Show
      when={!props.chat.notFound}
      fallback={
        <div class="flex-1 overflow-y-auto py-inset-panel">
          <SessionMissing onClose={props.onCloseMissing} />
        </div>
      }
    >
      <Show
        when={!(loading() && empty())}
        fallback={
          <div class="flex-1 overflow-y-auto py-inset-panel">
            <div role="status" aria-label={t("loadingConversation")} class="mx-auto flex w-full max-w-session flex-col gap-6 px-4 md:px-6">
              {[0, 1, 2].map((index) => (
                <div aria-hidden class="flex flex-col gap-2">
                  <div class={`h-2 rounded-xs bg-bg-layer-02 motion-safe:animate-pulse ${index === 1 ? "w-2/3" : "w-1/2"}`} />
                  <div class="h-2 w-full rounded-xs bg-bg-layer-01 motion-safe:animate-pulse" />
                  <div class="h-2 w-4/5 rounded-xs bg-bg-layer-01 motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        }
      >
        <ToolScopeProvider scope={props.chat.id}>
          <div class="relative flex min-h-0 flex-1 flex-col">
            <Show when={searchOpen()}>
              <div
                data-component="timeline-search-bar"
                class="absolute end-6 top-2 z-30 flex h-7 w-[200px] max-w-[50vw] items-center gap-1.5 rounded-md border-[0.5px] border-border-base bg-bg-layer-01 px-1.5 shadow-elevation-raised"
              >
                <Search class="size-3.5 shrink-0 text-text-faint" />
                <input
                  ref={(el) => (input = el)}
                  value={query()}
                  onInput={(event) => {
                    setQuery(event.currentTarget.value);
                    setHit(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSearchOpen(false);
                      return;
                    }
                    if (event.altKey || event.ctrlKey || event.metaKey) return;
                    if (event.key === "Enter" && !event.isComposing) {
                      event.preventDefault();
                      if (hits().length === 0) return;
                      setHit((current) => {
                        const next = current + (event.shiftKey ? -1 : 1);
                        return ((next % hits().length) + hits().length) % hits().length;
                      });
                      return;
                    }
                    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.isComposing) {
                      event.preventDefault();
                      if (hits().length === 0) return;
                      const delta = event.key === "ArrowDown" ? 1 : -1;
                      setHit((current) => (current + delta + hits().length) % hits().length);
                    }
                  }}
                  type="search"
                  aria-label={t("searchTranscript")}
                  placeholder={t("searchTranscript")}
                  spellcheck={false}
                  autocomplete="off"
                  class="min-w-0 flex-1 bg-transparent text-[13px] leading-4 text-text-base outline-none placeholder:text-text-faint"
                />
                <Show when={needle()}>
                  <span class="shrink-0 text-[11px] leading-4 font-[440] tabular-nums text-text-muted">
                    {occurrences() === 0 ? 0 : Math.min(hit() + 1, occurrences())}/{occurrences()}
                  </span>
                </Show>
                <button
                  type="button"
                  aria-label={t("closeSearch")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setSearchOpen(false)}
                  class="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                >
                  <X class="size-3.5" />
                </button>
              </div>
            </Show>

            <div class="relative flex min-h-0 flex-1">
              <div
                ref={(el) => (container = el)}
                onScroll={onScroll}
                onKeyDown={onKeyDown}
                tabIndex={-1}
                aria-busy={props.chat.running}
                data-virtualized={virtual() ? "true" : undefined}
                data-virtual-range={
                  virtual() && virtualItems().length > 0
                    ? `${virtualItems()[0].index}-${virtualItems()[virtualItems().length - 1].index}`
                    : undefined
                }
                class="scroll-stable-both min-h-0 flex-1 overflow-y-auto pb-4"
                style={{ "--sticky-accordion-top": headerInset() } as JSX.CSSProperties}
              >
                <Show when={props.header}>
                  <div
                    data-slot="session-sticky-header"
                    class="sticky top-0 z-30 bg-bg-base before:pointer-events-none before:absolute before:inset-x-0 before:top-full before:h-4 before:bg-[linear-gradient(to_bottom,var(--bg-base),transparent)]"
                  >
                    {props.header}
                  </div>
                </Show>
                <div
                  class="mx-auto flex w-full max-w-session flex-col px-4 pt-6 md:px-6"
                  style={(props.bottomInset ?? 0) > 0 ? { "padding-bottom": `${(props.bottomInset ?? 0) + 16}px` } : undefined}
                >
                  <Show when={empty()}>
                    <EmptyState />
                  </Show>

                  <Show when={hiddenRows() > 0 && Boolean(props.onLoadOlder)}>
                    <button
                      type="button"
                      data-slot="timeline-load-older"
                      onClick={() => props.onLoadOlder?.()}
                      class="interactive mb-2 flex h-7 shrink-0 items-center justify-center rounded-md text-body font-[440] text-text-muted hover:text-text-base"
                    >
                      {t("loadOlder")}
                    </button>
                  </Show>

                  <Show
                    when={virtual()}
                    fallback={
                      <For each={rowItems()}>
                        {(item) => (
                          <div
                            data-row-key={item.row().key}
                            data-search-key={item.row().key}
                            data-message-id={item.row().entry?.role === "user" ? item.row().entry!.key : undefined}
                            id={item.row().entry?.role === "user" ? `message-${item.row().entry!.key}` : undefined}
                            class={spacingFor(item.row(), item.index())}
                          >
                            {renderRow(item.row, item.index)}
                          </div>
                        )}
                      </For>
                    }
                  >
                    <div
                      data-slot="timeline-virtual-content"
                      style={{ position: "relative", height: `${totalSize()}px` }}
                    >
                      <For each={windowRows()}>
                        {(item) => (
                          <div
                            ref={(el) => engine.measureElement(el)}
                            data-index={item.index()}
                            data-row-key={item.row().key}
                            data-search-key={item.row().key}
                            data-message-id={item.row().entry?.role === "user" ? item.row().entry!.key : undefined}
                            id={item.row().entry?.role === "user" ? `message-${item.row().entry!.key}` : undefined}
                            class={spacingFor(item.row(), item.index())}
                            style={{
                              position: "absolute",
                              // Keep `top` rather than `transform`: a transformed row
                              // becomes the containing block for sticky tool headers,
                              // so they would scroll away instead of masking the top.
                              top: `${item.start()}px`,
                              left: 0,
                              width: "100%",
                            }}
                          >
                            {renderRow(item.row, item.index)}
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={working()}>
                    <RunningStatus status={status()} />
                  </Show>

                  <Show when={props.chat.notice}>
                    {(notice) => <TimelineSeparator label={notice()} />}
                  </Show>

                  <Show when={props.chat.lastRunStatus && !running() && props.chat.lastRunStatus !== "completed"}>
                    <RunFooter status={props.chat.lastRunStatus!} ms={props.chat.lastRunMs} />
                  </Show>
                </div>
                <Show when={props.onQuote}>
                  {(quote) => <SelectionQuote root={() => container} onQuote={quote()} />}
                </Show>
              </div>
              <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-[linear-gradient(to_bottom,var(--bg-base),transparent)]"
              />
            </div>

            <Show when={awayFromBottom()}>
              <button
                type="button"
                onClick={toBottom}
                aria-label={t("scrollToLatest")}
                style={{ bottom: `${(props.bottomInset ?? 0) + 16}px` }}
                class="interactive absolute right-6 z-10 grid size-control-md place-items-center rounded-full border border-border-strong bg-bg-layer-02 text-text-muted"
              >
                <ArrowDown class="size-4" />
              </button>
            </Show>
            <MessageNav items={navItems()} current={navCurrent()} onSelect={jumpToMessage} />
          </div>
        </ToolScopeProvider>
      </Show>
    </Show>
  );
}

type SelectionSpot = { x: number; top: number; bottom: number; text: string };

/** Counts every occurrence of a term in the transcript's text nodes. */
function occurrencesIn(root: HTMLElement, needle: string): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent ?? "").toLowerCase();
    let at = text.indexOf(needle);
    while (at >= 0) {
      total += 1;
      at = text.indexOf(needle, at + needle.length);
    }
    node = walker.nextNode();
  }
  return total;
}

/**
 * Offers to quote text selected in the transcript. The reference has no
 * message-level Quote action; it reveals a toolbar beside the selection.
 */
function SelectionQuote(props: { root: () => HTMLDivElement | undefined; onQuote: (text: string) => void }) {
  const tr = useT();
  const [spot, setSpot] = createSignal<SelectionSpot>();

  onMount(() => {
    const node = props.root();
    if (!node) return;
    const update = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSpot(undefined);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!node.contains(range.commonAncestorContainer)) {
        setSpot(undefined);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        setSpot(undefined);
        return;
      }
      // jsdom does not implement Range.getBoundingClientRect; the toolbar
      // still appears in tests and simply anchors to the viewport origin.
      const rect =
        typeof range.getBoundingClientRect === "function"
          ? range.getBoundingClientRect()
          : { left: 0, top: 0, bottom: 0, width: 0, height: 0 };
      setSpot({
        x: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom,
        text,
      });
    };
    const hide = () => setSpot(undefined);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    node.addEventListener("pointerup", update);
    node.addEventListener("keyup", update);
    node.addEventListener("scroll", hide, true);
    document.addEventListener("selectionchange", update);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      node.removeEventListener("pointerup", update);
      node.removeEventListener("keyup", update);
      node.removeEventListener("scroll", hide, true);
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <Show when={spot()}>
      {(current) => {
        const above = () => current().top > 64;
        return (
          <Portal mount={document.body}>
            <div
              data-component="selection-quote"
              role="toolbar"
              aria-label={tr("quoteSelection")}
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              style={{
                left: `${current().x}px`,
                top: `${above() ? current().top : current().bottom}px`,
                transform: `translate(-50%, ${above() ? "calc(-100% - 8px)" : "8px"})`,
              }}
              class="elevation-floating fixed z-50 flex select-none items-center gap-0.5 rounded-lg bg-bg-layer-01 p-0.5"
            >
              <button
                type="button"
                data-slot="selection-quote-add"
                onClick={() => {
                  props.onQuote(current().text);
                  window.getSelection()?.removeAllRanges();
                  setSpot(undefined);
                }}
                class="interactive flex h-6 items-center gap-1 rounded-xs px-1.5 text-caption font-[530] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
              >
                <MessageSquare class="size-3.5 text-text-faint" />
                Add
              </button>
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}

const TURN_DIFF_FILES = 5;

/** Changed-file summary that follows a completed turn. */
function TurnDiffSummary(props: {
  totals: TurnTotals;
  detail: TimelineDetailInput;
  groupKey: string;
  onReview?: () => void;
}) {
  const [showAll, setShowAll] = createSignal(false);
  const patch = () => props.totals.patch ?? "";
  const tool = (): ToolRun | undefined =>
    patch()
      ? { id: `${props.groupKey}:patch`, name: "patch", arguments: "{}", diff: patch(), done: true }
      : undefined;
  return (
    <div data-component="turn-diff" class="flex flex-col gap-2">
      <div class="flex h-6 min-w-0 items-center gap-2">
        <span class="shrink-0 text-reading leading-5 font-[530] text-text-base tabular-nums">
          {props.totals.files} {props.totals.files === 1 ? "file" : "files"} changed
        </span>
        <span class="flex shrink-0 items-center justify-end gap-2" dir="ltr">
          <span class="text-caption leading-none font-[440] tracking-[0.05px] text-state-fg-success">
            +{props.totals.added}
          </span>
          <span class="text-caption leading-none font-[440] tracking-[0.05px] text-state-fg-danger">
            -{props.totals.removed}
          </span>
        </span>
        <div class="ms-auto flex shrink-0 items-center gap-3">
          <Show when={props.totals.files > TURN_DIFF_FILES}>
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              class="interactive text-reading leading-5 font-[440] text-text-accent hover:text-text-accent"
            >
              {showAll() ? "Show less" : "Show all"}
            </button>
          </Show>
          <Show when={props.onReview}>
            {(review) => (
              <button
                type="button"
                onClick={() => review()()}
                class="interactive text-reading leading-5 font-[440] text-text-accent hover:text-text-accent"
              >
                Review
              </button>
            )}
          </Show>
        </div>
      </div>
      <Show when={tool()}>
        {(fileTool) => (
          <FileGroup
            tools={[fileTool()]}
            detail={props.detail}
            groupKey={`${props.groupKey}:diff`}
            showHeader={false}
            limit={showAll() ? undefined : TURN_DIFF_FILES}
          />
        )}
      </Show>
    </div>
  );
}

function EmptyState() {
  const tr = useT();
  return (
    <div class="select-none py-24 text-center">
      <p class="text-reading text-text-base">{tr("emptyTranscriptTitle")}</p>
      <p class="mx-auto mt-2 max-w-measure-narrow text-body leading-5 text-text-faint">
        {tr("emptyTranscriptHint")}
      </p>
    </div>
  );
}

/** The session the core no longer has: a deleted row that a cached list kept. */
function SessionMissing(props: { onClose?: () => void }) {
  const tr = useT();
  return (
    <div data-component="session-missing" class="select-none py-24 text-center">
      <p class="text-reading text-text-base">{tr("sessionNotFoundTitle")}</p>
      <p class="mx-auto mt-2 max-w-measure-narrow text-body leading-5 text-text-faint">
        {tr("sessionNotFoundHint")}
      </p>
      <Show when={props.onClose}>
        {(onClose) => (
          <button
            type="button"
            onClick={() => onClose()()}
            class="interactive mt-6 inline-flex h-control-md items-center rounded-md border-[0.5px] border-border-base bg-bg-layer-01 px-control text-body font-[440] text-text-base hover:bg-bg-layer-02"
          >
            {tr("sessionNotFoundClose")}
          </button>
        )}
      </Show>
    </div>
  );
}

/** The text a transcript search matches: message text plus tool arguments and output. */
function rowSearchText(row: TimelineRow): string {
  if (row.diff) return "";
  if (row.retry) return row.retry.message;
  if (row.error) return row.error;
  if (row.entry) {
    if (row.entry.loaded) return row.entry.loaded.join("\n");
    if (row.entry.shell) return [row.entry.shell.command, row.entry.shell.output].join("\n");
    const tool = row.entry.tool;
    return [row.entry.text ?? "", tool?.name ?? "", tool?.arguments ?? "", tool?.output ?? ""].join("\n");
  }
  const parts = row.parts ?? [];
  const tools = row.tool
    ? [row.tool]
    : (row.read ?? row.files ?? parts.flatMap((part) => (part.kind === "tool" ? [part.tool] : [])));
  const extra = parts.flatMap((part) =>
    part.kind === "tool"
      ? []
      : [part.kind === "shell" ? (part.entry.shell?.command ?? "") : part.kind === "loaded" ? (part.entry.loaded?.join("\n") ?? "") : (part.entry.text ?? "")],
  );
  return [...tools.map((tool) => [tool.name, tool.arguments, tool.output ?? ""].join("\n")), ...extra].join("\n");
}

/**
 * Whether two projections of the same row carry the same payload. Every field
 * is compared by identity except the arrays, which the projection rebuilds on
 * every pass while their elements keep their identity.
 */
function sameRowPayload(left: TimelineRow, right: TimelineRow): boolean {
  if (left === right) return true;
  return (
    left.key === right.key &&
    left.entry === right.entry &&
    left.tool === right.tool &&
    left.diff === right.diff &&
    left.retry === right.retry &&
    left.error === right.error &&
    left.divider === right.divider &&
    left.dividerSwitch === right.dividerSwitch &&
    sameItems(left.parts, right.parts) &&
    sameItems(left.read, right.read) &&
    sameItems(left.files, right.files)
  );
}

function sameItems<T>(left: T[] | undefined, right: T[] | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Two adjacent user prompts read as one run when they were sent the same way.
 * A pending steer, an attachment or a model switch starts a new block.
 */
function joinsRun(above: TimelineEntry | undefined, below: TimelineEntry | undefined): boolean {
  if (above?.role !== "user" || below?.role !== "user") return false;
  return (
    Boolean(above.pending) === Boolean(below.pending) &&
    Boolean((above.text ?? "").trim()) &&
    Boolean((below.text ?? "").trim()) &&
    !below.attachments?.length &&
    (above.agent ?? "") === (below.agent ?? "") &&
    (above.provider ?? "") === (below.provider ?? "") &&
    (above.model ?? "") === (below.model ?? "")
  );
}

/** One row of the ordered transcript: user turn, assistant text or tool block. */
function EntryView(props: {
  entry: TimelineEntry;
  meta?: string[];
  showCopy?: boolean;
  sources?: SourceItem[];
  userMeta?: string[];
  metaHidden?: boolean;
  latest?: boolean;
  onOpenFile?: (path: string) => void;
  onUndo?: (text: string) => void;
  onRevert?: (text: string, created?: string) => void;
  onFork?: (text: string) => void;
  canUndo?: boolean;
  detail: TimelineDetailInput;
  runTop?: boolean;
  runBottom?: boolean;
  foldLongMessages?: boolean;
  onOpenSession?: (sessionID: string) => void;
  working?: boolean;
}) {
  return (
    <Switch
      fallback={
        <Show when={props.entry.text}>
          {(text) => (
            <AssistantText
              text={text()}
              meta={props.meta}
              showCopy={props.showCopy}
              sources={props.sources}
              onOpenFile={props.onOpenFile}
              streaming={props.entry.live}
            />
          )}
        </Show>
      }
    >
      <Match when={props.entry.role === "loaded" && props.entry.loaded}>
        {(paths) => <LoadedInstructions paths={paths()} />}
      </Match>
      <Match when={props.entry.role === "notice" && props.entry.notice}>
        {(notice) => <NoticeSeparator notice={notice()} onOpenSession={props.onOpenSession} />}
      </Match>
      <Match when={props.entry.role === "notice" && props.entry.text}>
        {(label) => <TimelineSeparator label={label()} />}
      </Match>
      <Match when={props.entry.role === "reasoning"}>
        <ReasoningRow entry={props.entry} detail={props.detail} />
      </Match>
      <Match when={props.entry.role === "compaction"}>
        <CompactionMessage entry={props.entry} working={props.working} />
      </Match>
      <Match when={props.entry.role === "shell" && props.entry.shell}>
        {(shell) => (
          <div class="mt-3">
            <SessionShellMessage shell={shell()} entryKey={props.entry.key} detail={props.detail} />
          </div>
        )}
      </Match>
      <Match when={props.entry.role === "user"}>
        <UserBubble
          text={props.entry.text ?? ""}
          attachments={props.entry.attachments}
          references={props.entry.references}
          comments={props.entry.comments}
          voice={props.entry.voice}
          pending={props.entry.pending}
          steer={props.entry.steer}
          created={props.entry.created}
          meta={props.userMeta}
          metaHidden={props.metaHidden}
          latest={props.latest}
          runTop={props.runTop}
          runBottom={props.runBottom}
          onUndo={props.onUndo}
          onRevert={props.onRevert}
          onFork={props.onFork}
          canUndo={props.canUndo}
          foldLongMessages={props.foldLongMessages}
        />
      </Match>
    </Switch>
  );
}

/**
 * One transcript row. The projection hands every row a stable identity while
 * only the last one streams, so the branches stay mounted on their own and a
 * delta reaches the streaming text instead of rebuilding the row.
 */
function TimelineRowView(props: {
  row: TimelineRow;
  busy: boolean;
  runTop: boolean;
  runBottom: boolean;
  latest: boolean;
  footer: boolean;
  sources?: SourceItem[];
  detail: TimelineDetailInput;
  modelLabel?: string;
  modelName?: (provider: string, model: string) => string;
  showAgent?: boolean;
  canUndo?: boolean;
  foldLongMessages?: boolean;
  running: boolean;
  lastRunStatus?: ChatState["lastRunStatus"];
  turn?: TurnUsage;
  workspace?: string;
  runningSubagents?: ReadonlySet<string>;
  shellOutput?: (tool: ToolRun) => ShellOutputSource | undefined;
  onReview?: () => void;
  onOpenFile?: (path: string) => void;
  onOpenSession?: (sessionID: string) => void;
  onUndo?: (text: string) => void;
  onRevert?: (text: string, created?: string) => void;
  onFork?: (text: string) => void;
}) {
  const entry = () => props.row.entry;
  const metaOptions = () => ({
    showAgent: props.showAgent,
    modelLabel: props.modelLabel,
    modelName: props.modelName,
    running: props.running,
    lastRunStatus: props.lastRunStatus,
    turn: props.turn,
  });

  return (
    <Switch
      fallback={
        <Show when={entry()}>
          {(current) => (
            <EntryView
              entry={current()}
              meta={props.footer ? turnFooterMeta(current(), metaOptions()) : undefined}
              showCopy={props.footer}
              sources={props.footer ? props.sources : undefined}
              userMeta={current().role === "user" ? entryMeta(current(), metaOptions()) : undefined}
              metaHidden={props.runBottom}
              latest={props.latest}
              onOpenFile={props.onOpenFile}
              onUndo={props.onUndo}
              onRevert={props.onRevert}
              onFork={props.onFork}
              canUndo={props.canUndo}
              detail={props.detail}
              runTop={props.runTop}
              runBottom={props.runBottom}
              foldLongMessages={props.foldLongMessages}
              onOpenSession={props.onOpenSession}
              working={props.running}
            />
          )}
        </Show>
      }
    >
      <Match when={props.row.diff}>
        {(totals) => (
          <TurnDiffSummary
            totals={totals()}
            detail={props.detail}
            groupKey={props.row.key}
            onReview={props.onReview}
          />
        )}
      </Match>
      <Match when={props.row.retry}>{(retry) => <SessionRetryCard retry={retry()} />}</Match>
      <Match when={props.row.error}>{(message) => <SessionErrorCard message={message()} />}</Match>
      <Match when={props.row.divider}>
        <Show
          when={props.row.dividerSwitch}
          fallback={<TimelineSeparator label={props.row.divider ?? ""} />}
        >
          {(value) => <SwitchSeparator value={value()} modelName={props.modelName} />}
        </Show>
      </Match>
      <Match when={props.row.parts}>
        {(parts) => (
          <ToolBlock
            parts={parts()}
            busy={props.busy}
            onOpenFile={props.onOpenFile}
            onOpenSession={props.onOpenSession}
            workspace={props.workspace}
            runningSubagents={props.runningSubagents}
            shellOutput={props.shellOutput}
            detail={props.detail}
          />
        )}
      </Match>
      <Match when={props.row.read}>
        {(tools) => (
          <div data-entry="tool">
            <ReadGroup tools={tools()} groupKey={props.row.key} />
          </div>
        )}
      </Match>
      <Match when={props.row.files}>
        {(tools) => (
          <div data-entry="tool">
            <FileGroup
              tools={tools()}
              detail={props.detail}
              groupKey={props.row.key}
              showHeader={props.row.files?.[0]?.name === "edit"}
            />
          </div>
        )}
      </Match>
      <Match when={props.row.tool}>
        {(tool) => (
          <ToolStandalone
            tool={tool()}
            onOpenSession={props.onOpenSession}
            workspace={props.workspace}
            runningSubagents={props.runningSubagents}
            shellOutput={props.shellOutput}
            detail={props.detail}
          />
        )}
      </Match>
    </Switch>
  );
}

/** Labels under one message: who wrote it and, for a finished turn, the run. */
function entryMeta(
  entry: TimelineEntry,
  options: {
    showAgent?: boolean;
    modelLabel?: string;
    modelName?: (provider: string, model: string) => string;
  },
): string[] {
  // Agent and model come from the message itself. A message recorded before
  // metadata existed stays without an agent label rather than borrowing the
  // agent selected now.
  const agent = options.showAgent && entry.agent ? capitalize(entry.agent) : "";
  const model = entry.model
    ? options.modelName
      ? options.modelName(entry.provider ?? "", entry.model)
      : entry.model
    : options.modelLabel ?? "";
  return [agent, model];
}

/** The footer of a finished turn: labels plus its own duration and throughput. */
function turnFooterMeta(
  entry: TimelineEntry,
  options: {
    showAgent?: boolean;
    modelLabel?: string;
    modelName?: (provider: string, model: string) => string;
    running: boolean;
    lastRunStatus?: ChatState["lastRunStatus"];
    turn?: TurnUsage;
  },
): string[] {
  return [
    ...entryMeta(entry, options),
    !options.running && options.turn?.durationMs ? formatDuration(options.turn.durationMs) : "",
    !options.running && options.lastRunStatus === "stopped" ? t("interrupted") : "",
    options.turn?.tokensPerSecond
      ? t("tokensPerSecond", { value: options.turn.tokensPerSecond.toFixed(1) })
      : "",
  ].filter(Boolean);
}

const USER_MESSAGE_FOLD_OVER = 12;
const USER_MESSAGE_FOLD_SHOW = 8;
const USER_MESSAGE_LINE_HEIGHT = 21;

/**
 * Long prompts fold to eight lines with a mask, the way the reference keeps a
 * pasted block from taking over the transcript.
 */
function UserMessageText(props: { text: string; fold?: boolean }) {
  const tr = useT();
  const [expanded, setExpanded] = createSignal(false);
  const long = () =>
    (props.fold ?? true) && (props.text.split("\n").length > USER_MESSAGE_FOLD_OVER || props.text.length > 1200);

  return (
    <Show when={long()} fallback={<>{props.text}</>}>
      <span class="block">
        <span
          class={`block ${
            expanded()
              ? ""
              : "overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%-40px),transparent)]"
          }`}
          style={expanded() ? undefined : { "max-height": `${USER_MESSAGE_FOLD_SHOW * USER_MESSAGE_LINE_HEIGHT}px` }}
        >
          {props.text}
        </span>
        <button
          type="button"
          aria-expanded={expanded()}
          onClick={() => setExpanded((value) => !value)}
          class="interactive mt-1 flex h-6 items-center gap-1 rounded-xs text-[13px] leading-5 text-text-muted hover:text-text-base"
        >
          {expanded() ? tr("showLess") : tr("messageReadMore")}
          <ChevronDown class={`size-3.5 transition-transform ${expanded() ? "rotate-180" : ""}`} />
        </button>
      </span>
    </Show>
  );
}

/** One image attachment thumbnail above the bubble. */
function UserAttachmentImage(props: { attachment: EntryAttachment }) {
  const name = () => attachmentName(props.attachment.name, props.attachment.mime);
  return (
    <span
      data-slot="user-message-attachment"
      data-type="image"
      class="relative h-[46px] w-[58px] overflow-hidden rounded-md bg-bg-layer-02 text-text-faint shadow-[inset_0_0_0_0.5px_var(--border-base)]"
    >
      <Show
        when={props.attachment.data}
        fallback={
          <span class="grid size-full place-items-center">
            <ImageIcon class="size-5" />
          </span>
        }
      >
        {(data) => (
          <img
            src={`data:${props.attachment.mime};base64,${data()}`}
            alt={name()}
            class="size-full object-cover"
          />
        )}
      </Show>
    </span>
  );
}

/** One file or directory attachment card above the bubble. */
function UserAttachmentFile(props: { attachment: EntryAttachment }) {
  const name = () => attachmentName(props.attachment.name, props.attachment.mime);
  const kind = () => (props.attachment.kind === "directory" ? "directory" : "file");
  return (
    <span
      data-slot="user-message-attachment"
      data-type={kind()}
      title={props.attachment.name ?? name()}
      class="flex w-40 min-w-40 max-w-40 flex-col gap-1.5 rounded-md border-[0.5px] border-border-base bg-bg-layer-02 p-2 text-text-muted transition-colors hover:border-border-strong"
    >
      <span class="w-full min-w-0 truncate text-[11px] leading-[14px] font-[530] tracking-[0.05px] text-text-base">
        {name().replace(/\\/g, "/").split("/").pop() ?? name()}
      </span>
      <span class="flex min-h-4 min-w-0 items-center gap-1 overflow-hidden text-[11px] leading-[14px] font-[440] tracking-[0.05px] whitespace-nowrap">
        <FileTypeIcon path={props.attachment.name ?? props.attachment.mime} type={kind()} class="size-3 shrink-0" />
        <span class="min-w-0 truncate">
          {attachmentTypeLabel(name(), props.attachment.mime, props.attachment.kind)}
          {attachmentContextLabel(props.attachment) ? ` ${attachmentContextLabel(props.attachment)}` : ""}
        </span>
      </span>
    </span>
  );
}

/** Attachment row shown above the bubble, images first as they arrive. */
function UserAttachments(props: { attachments: EntryAttachment[] }) {
  return (
    <div class="mb-2 flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
      <For each={props.attachments}>
        {(attachment) =>
          attachment.mime.startsWith("image/") ? (
            <UserAttachmentImage attachment={attachment} />
          ) : (
            <UserAttachmentFile attachment={attachment} />
          )
        }
      </For>
    </div>
  );
}

/** Hover-revealed menu with copy, fork, undo and revert for one user turn. */
function UserMessageActions(props: {
  text: string;
  created?: string;
  pending?: boolean;
  latest?: boolean;
  onUndo?: (text: string) => void;
  onRevert?: (text: string, created?: string) => void;
  onFork?: (text: string) => void;
  canUndo?: boolean;
}) {
  const tr = useT();
  return (
    <span
      data-slot="user-message-actions"
      class={`absolute end-[calc(8px+(1lh-20px)/2)] top-[calc(8px+(1lh-20px)/2)] flex rounded-[4px] bg-[linear-gradient(to_left,var(--bg-layer-02)_calc(100%_-_16px),transparent)] pl-4 opacity-0 group-focus-within/bubble:opacity-100 group-hover/bubble:opacity-100 [@media(hover:none)]:opacity-100 ${
        props.pending ? "bg-[linear-gradient(to_left,var(--bg-layer-01)_calc(100%_-_16px),transparent)]" : ""
      }`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          aria-label={tr("messageMoreActions")}
          class="interactive grid size-5 place-items-center rounded-[4px] text-text-faint hover:text-text-base"
        >
          <ChevronDown class="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <Show when={props.created}>
            {(created) => (
              <>
                <DropdownMenuLabel class="tabular-nums">{formatMessageTime(created())}</DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
          </Show>
          <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(props.text)}>
            <Copy />
            {tr("messageCopy")}
          </DropdownMenuItem>
          <Show when={!props.pending && props.onFork}>
            {(onFork) => (
              <DropdownMenuItem onSelect={() => onFork()(props.text)}>
                <GitFork />
                {tr("messageFork")}
              </DropdownMenuItem>
            )}
          </Show>
          <Show when={!props.pending}>
            <Show
              when={props.latest && props.onUndo}
              fallback={
                <Show when={props.onRevert}>
                  {(onRevert) => (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onRevert()(props.text, props.created)}>
                        <History />
                        {tr("messageRevert")}
                      </DropdownMenuItem>
                    </>
                  )}
                </Show>
              }
            >
              {(onUndo) => (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={props.canUndo === false} onSelect={() => onUndo()(props.text)}>
                    <RotateCcw />
                    {tr("messageUndo")}
                  </DropdownMenuItem>
                </>
              )}
            </Show>
          </Show>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** The rounded surface carrying the user's text and its actions. */
function UserBubbleBody(props: {
  text: string;
  comments?: PromptComment[];
  voice?: boolean;
  pending?: boolean;
  top: number;
  bottom: number;
  foldLongMessages?: boolean;
  actions: JSX.Element;
}) {
  const tr = useT();
  return (
    <div
      data-slot="user-message-bubble"
      data-pending={props.pending ? "true" : undefined}
      data-run-top={props.top > 0.5 ? "true" : undefined}
      data-run-bottom={props.bottom > 0.5 ? "true" : undefined}
      style={{
        // The spring drives a continuous radius; the data attributes above
        // carry the settled state so CSS and tests read one contract.
        "border-start-end-radius": `${10 - 6 * props.top}px`,
        "border-end-end-radius": `${10 - 6 * props.bottom}px`,
      }}
      class={`user-message-bubble group/bubble relative max-w-[min(82%,64ch)] overflow-hidden rounded-[10px] px-3 py-2 text-[14px] font-[440] leading-[1.5] whitespace-pre-wrap select-text transition-[background-color,color] duration-200 motion-reduce:transition-none ${
        props.pending ? "bg-bg-layer-01 text-text-muted" : "bg-bg-layer-02 text-text-base"
      }`}
    >
      <div class="flex min-w-0 items-start gap-2">
        <Show when={props.voice}>
          <span data-slot="user-message-voice" class="mt-0.5 shrink-0 text-text-faint" aria-label={tr("voicePrompt")}>
            <AudioLines class="size-4" />
          </span>
        </Show>
        <div class="min-w-0">
          <UserMessageText text={props.text} fold={props.foldLongMessages} />
        </div>
      </div>
      <Show when={props.comments && props.comments.length > 0}>
        <div data-slot="user-message-comments" class="mt-2 flex flex-col gap-1.5">
          <For each={props.comments}>
            {(comment, index) => (
              <div
                data-component="comment-card"
                class="rounded-md bg-bg-layer-01 px-2 py-1.5 text-start"
              >
                <div class="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-text-faint">
                  <FileTypeIcon path={comment.file} class="size-3 shrink-0" />
                  <span class="truncate">{comment.file}</span>
                  <Show when={comment.line}>
                    <span class="shrink-0 tabular-nums">:{comment.line}</span>
                  </Show>
                </div>
                <div class="mt-0.5 whitespace-pre-wrap text-meta leading-5 text-text-muted">{comment.body}</div>
              </div>
            )}
          </For>
        </div>
      </Show>
      {props.actions}
    </div>
  );
}

function AudioLines(props: { class?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" class={props.class}>
      <path
        d="M2.5 6.5v3M5.5 4.5v7M8.5 3v10M11.5 5.5v5M14 7v2"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** Pending marker and turn metadata under the bubble. */
function UserMessageMeta(props: { pending?: boolean; meta?: string[]; progress: number }) {
  const tr = useT();
  const hasMeta = () => Boolean(props.meta && props.meta.length > 0);

  return (
    <Show when={props.pending || hasMeta()}>
      <div
        data-slot="user-message-meta"
        style={{ "max-height": `${props.progress * 20}px`, opacity: props.progress }}
        class="flex select-none items-center justify-end overflow-hidden"
      >
        <span class="flex min-w-0 items-center gap-1 overflow-hidden text-[12px] leading-[18px] font-[440] tracking-[0.05px] whitespace-nowrap text-text-faint">
          <Show when={hasMeta()}>
            {/* The agent and model stay out of the way until the pointer is on the
                message; Pending is the only label that always shows. */}
            <span
              data-slot="user-message-meta-label"
              class="flex min-w-0 items-center gap-1 opacity-0 group-focus-within/user:opacity-100 group-hover/user:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <For each={props.meta}>
                {(item, index) => (
                  <span class="flex min-w-0 items-center gap-1">
                    <Show when={index() > 0}>
                      <span aria-hidden="true">·</span>
                    </Show>
                    <span class="truncate">{item}</span>
                  </span>
                )}
              </For>
              <Show when={props.pending}>
                <span aria-hidden="true">·</span>
              </Show>
            </span>
          </Show>
          <Show when={props.pending}>
            <span data-slot="user-message-pending">{tr("messagePending")}</span>
          </Show>
        </span>
      </div>
    </Show>
  );
}

/** Right-aligned user bubble with its attachments above, like the reference message surface. */
function UserBubble(props: {
  text: string;
  attachments?: EntryAttachment[];
  references?: EntryAttachment[];
  comments?: PromptComment[];
  voice?: boolean;
  pending?: boolean;
  /** The prompt joined a live turn, so the row grows in where it landed. */
  steer?: boolean;
  created?: string;
  meta?: string[];
  metaHidden?: boolean;
  latest?: boolean;
  runTop?: boolean;
  runBottom?: boolean;
  onUndo?: (text: string) => void;
  onRevert?: (text: string, created?: string) => void;
  onFork?: (text: string) => void;
  canUndo?: boolean;
  foldLongMessages?: boolean;
}) {
  const top = useSpring(() => (props.runTop ? 1 : 0));
  const bottom = useSpring(() => (props.runBottom ? 1 : 0));
  const metaProgress = useSpring(() => (props.metaHidden ? 0 : 1));
  const files = () => [...(props.references ?? []), ...(props.attachments ?? [])];
  return (
    <div
      data-entry="user"
      data-steer={props.steer ? "true" : undefined}
      style={{ "margin-top": `${4 + (1 - top()) * 12}px` }}
      class={`group/user flex flex-col items-end${props.steer ? " steer-arrival" : ""}`}
    >
      <Show when={files().length > 0}>
        <UserAttachments attachments={files()} />
      </Show>
      <UserBubbleBody
        text={props.text}
        comments={props.comments}
        voice={props.voice}
        pending={props.pending}
        top={top()}
        bottom={bottom()}
        foldLongMessages={props.foldLongMessages}
        actions={
          <UserMessageActions
            text={props.text}
            created={props.created}
            pending={props.pending}
            latest={props.latest}
            onUndo={props.onUndo}
            onRevert={props.onRevert}
            onFork={props.onFork}
            canUndo={props.canUndo}
          />
        }
      />
      <UserMessageMeta pending={props.pending} meta={props.meta} progress={metaProgress()} />
    </div>
  );
}

/** Project instruction files included in the prompt for this turn. */
function LoadedInstructions(props: { paths: string[] }) {
  return <LoadedRow paths={props.paths} />;
}

/** Web sources gathered by this turn, opened from a footer chip. */
function SourcesChip(props: { sources: SourceItem[] }) {
  const tr = useT();
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <button
        type="button"
        data-component="sources-chip"
        onClick={() => setOpen(true)}
        class="flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-xs px-1 text-[12px] leading-[18px] text-text-faint hover:text-text-base"
      >
        <Search class="size-3.5" aria-hidden="true" />
        <span>{tr("sourcesCount", { count: props.sources.length })}</span>
      </button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent class="max-w-md">
          <DialogTitle class="flex items-center gap-2">
            <Search class="size-4 text-text-muted" aria-hidden="true" />
            {tr("sourcesTitle")}
          </DialogTitle>
          <div class="flex max-h-80 flex-col gap-1 overflow-y-auto">
            <For each={props.sources}>
              {(source) => (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="flex min-w-0 flex-col rounded-sm px-2 py-1.5 hover:bg-bg-layer-02"
                >
                  <span class="truncate text-meta leading-4 text-text-base">{source.title}</span>
                  <span class="truncate text-[11px] leading-4 text-text-faint">{source.url}</span>
                </a>
              )}
            </For>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Assistant reply: full-width Markdown with a hover-revealed copy/meta footer. */
function AssistantText(props: {
  text: string;
  meta?: string[];
  showCopy?: boolean;
  sources?: SourceItem[];
  onOpenFile?: (path: string) => void;
  streaming?: boolean;
}) {
  return (
    <div data-entry="assistant" class="group/assistant">
      <Markdown text={props.text} onOpenFile={props.onOpenFile} streaming={props.streaming} />
      <Show when={props.showCopy}>
        <div
          data-slot="text-part-copy-wrapper"
          class="mt-2 flex h-5 select-none items-center gap-1 [@media(hover:hover)]:opacity-0 group-focus-within/assistant:opacity-100 group-hover/assistant:opacity-100 [&>*:first-child]:-ms-0.5"
        >
          <Show when={props.sources && props.sources.length > 0}>
            <SourcesChip sources={props.sources!} />
          </Show>
          <CopyButton text={props.text} label={t("copyResponse")} />
          <Show when={props.meta && props.meta.length > 0}>
            <span class="flex min-w-0 items-center gap-1 overflow-hidden text-[12px] font-[440] leading-[18px] tracking-[0.05px] whitespace-nowrap text-text-faint">
              <For each={props.meta}>
                {(item, index) => (
                  <span class="flex min-w-0 items-center gap-1">
                    <Show when={index() > 0}>
                      <span aria-hidden="true">·</span>
                    </Show>
                    <span class="truncate">{item}</span>
                  </span>
                )}
              </For>
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** Automatic provider retry, with the next attempt and the upstream message. */
function SessionRetryCard(props: { retry: NonNullable<ChatState["retry"]> }) {
  const [now, setNow] = createSignal(Date.now());
  onMount(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    onCleanup(() => window.clearInterval(timer));
  });
  const seconds = () => {
    const at = Date.parse(props.retry.next);
    return Number.isFinite(at) ? Math.max(0, Math.round((at - now()) / 1000)) : 0;
  };
  const message = () =>
    props.retry.message.length > 80 ? `${props.retry.message.slice(0, 80)}…` : props.retry.message;
  return (
    <div
      data-component="card"
      data-kind="session-retry-card"
      data-slot="session-turn-retry"
      class="error-card w-full min-w-0"
    >
      <div class="flex w-full items-start gap-2">
        <TriangleAlert class="size-4 shrink-0 text-state-fg-danger" />
        <div class="min-w-0 flex-1">
          <div data-slot="session-turn-retry-message" class="cursor-help truncate" title={props.retry.message}>
            <SessionErrorMessage message={message()} />
          </div>
          <div data-slot="session-turn-retry-info" class="text-meta leading-4 text-text-faint">
            <TextShimmer
              active
              text={`attempt ${props.retry.attempt}${seconds() > 0 ? ` · retrying in ${seconds()}s` : " · retrying now"}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Run error, rendered like the reference session error card. */
function SessionErrorCard(props: { message: string }) {
  return (
    <div
      data-component="card"
      data-kind="session-error-card"
      class="error-card w-full min-w-0"
    >
      <div class="flex w-full min-w-0 items-start gap-2">
        <TriangleAlert class="shrink-0 text-state-fg-danger" />
        <div class="min-w-0 select-text">
          <SessionErrorMessage message={props.message} links />
        </div>
      </div>
    </div>
  );
}

/** Emphasised first segment of a provider error; a scheme or port never splits a URL. */
function SessionErrorMessage(props: { message: string; links?: boolean }) {
  const url = () => props.message.search(/https?:\/\//);
  const title = () => {
    const at = url();
    const separator = props.message.slice(0, at === -1 ? undefined : at).indexOf(":");
    return separator === -1 ? undefined : props.message.slice(0, separator + 1);
  };
  const detail = () => {
    const at = url();
    const separator = props.message.slice(0, at === -1 ? undefined : at).indexOf(":");
    return separator === -1 ? props.message : props.message.slice(separator + 1);
  };
  return (
    <>
      <Show when={title()}>{(value) => <strong class="font-[530]">{value()}</strong>}</Show>
      <Show when={props.links} fallback={detail()}>
        <LinkedText text={detail()} />
      </Show>
    </>
  );
}

/**
 * Drives the quiet compaction divider's entrance: a new running compaction
 * waits out the grace before showing, and one that finishes inside it fades in
 * as Compacted only. The box never changes height, so the timeline holds still.
 */
function useCompactionEntrance(running: boolean, created?: string) {
  const [enter, setEnter] = createSignal<string | undefined>(undefined);
  let graceTimer: number | undefined;

  onMount(() => {
    const age = created ? Date.now() - Date.parse(created) : Number.POSITIVE_INFINITY;
    let state = createCompactionEntranceState({
      ageMs: Number.isFinite(age) ? age : Number.POSITIVE_INFINITY,
      running,
    });
    setEnter(selectCompactionEnter(state.state));
    for (const effect of state.effects) {
      if (effect.type !== "schedule-grace") continue;
      graceTimer = window.setTimeout(() => {
        state = transitionCompactionEntrance(state.state, GRACE_ELAPSED_EVENT);
        setEnter(selectCompactionEnter(state.state));
      }, effect.delayMs);
    }
    onCleanup(() => {
      if (graceTimer !== undefined) window.clearTimeout(graceTimer);
    });
  });

  // The entrance is decided when the divider mounts; a later status change
  // keeps the styling so the light does not restart mid-animation.
  return enter;
}

/** Rich compaction checkpoint: state, summary and how much history it replaced. */
function CompactionMessage(props: { entry: TimelineEntry; working?: boolean }) {
  const tr = useT();
  const [open, setOpen] = createSignal(false);
  const compaction = () => props.entry.compaction ?? {};
  const summary = () => (compaction().summary ?? "").trim();
  const running = () => compaction().status === "running";
  const failed = () => compaction().status === "failed";
  // An automatic checkpoint is background housekeeping, so it reads as one
  // quiet line with a travelling highlight instead of a full divider.
  const quiet = () => !running() && !failed() && compaction().reason === "auto";
  const enter = useCompactionEntrance(running(), props.entry.created);

  return (
    <Show
      when={running() && props.working}
      fallback={
        <Show
          when={quiet()}
          fallback={
            <div
              data-component="session-compaction-message"
              data-status={compaction().status ?? "completed"}
              class="my-3 flex w-full min-w-0 flex-col gap-2"
            >
              <div class="flex h-8 items-center gap-3 text-text-faint">
                <span class="timeline-separator-line h-px min-w-0 flex-1" />
                <span class="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 font-[440] tracking-[-0.04px]">
                  <Show
                    when={!running()}
                    fallback={<ActivityRing size={14} class="text-text-faint" />}
                  >
                    <span
                      aria-hidden="true"
                      class={`size-1.5 rounded-full ${failed() ? "bg-state-fg-danger" : "bg-state-fg-success"}`}
                    />
                  </Show>
                  <span class="shrink-0">
                    {running() ? tr("compactionRunning") : failed() ? tr("compactionFailed") : tr("compactionTitle")}
                  </span>
                  <Show when={!running() && compaction().reason}>
                    <span class="shrink-0 capitalize text-text-faint">· {compaction().reason}</span>
                  </Show>
                  <Show when={!running() && compaction().covered}>
                    <span class="truncate text-text-faint">· {compaction().covered} messages</span>
                  </Show>
                  <Show when={!running() && compaction().usage}>
                    <span class="shrink-0 text-text-faint">· {compaction().usage}</span>
                  </Show>
                </span>
                <span class="timeline-separator-line timeline-separator-line-reverse h-px min-w-0 flex-1" />
              </div>
              <Show
                when={compaction().error}
                fallback={
                  <Show when={summary()}>
                    {(text) => (
                      <div class="flex min-w-0 flex-col gap-1 rounded-md bg-bg-layer-01 px-2 py-1.5 shadow-[inset_0_0_0_0.5px_var(--border-muted)]">
                        <button
                          type="button"
                          aria-expanded={open()}
                          onClick={() => setOpen((value) => !value)}
                          class="flex min-w-0 items-center gap-1.5 text-start text-meta leading-4 text-text-muted hover:text-text-base"
                        >
                          <ChevronDown class={`size-3.5 shrink-0 transition-transform ${open() ? "" : "-rotate-90"}`} />
                          <span class="truncate">{open() ? tr("compactionHide") : previewOf(text())}</span>
                        </button>
                        <Show when={open()}>
                          <div class="max-h-80 overflow-y-auto border-t-[0.5px] border-border-base pt-2">
                            <Markdown text={text()} />
                          </div>
                        </Show>
                      </div>
                    )}
                  </Show>
                }
              >
                {(error) => (
                  <div class="rounded-md bg-bg-layer-01 px-2 py-1.5 text-meta leading-4 text-state-fg-danger">
                    <SessionErrorMessage message={error()} links />
                  </div>
                )}
              </Show>
            </div>
          }
        >
          <div
            data-component="session-compaction-message"
            data-quiet="true"
            data-status={compaction().status ?? "completed"}
            data-enter={enter()}
            class="my-1 flex w-full min-w-0 flex-col gap-2"
          >
            <button
              type="button"
              aria-expanded={open()}
              onClick={() => setOpen((value) => !value)}
              class="timeline-quiet-line flex h-6 min-w-0 items-center gap-2 text-start text-meta leading-4 text-text-faint hover:text-text-muted"
            >
              <span class="shrink-0">{tr("compactionTitle")}</span>
              <Show when={compaction().covered}>
                <span class="shrink-0">· {compaction().covered} messages</span>
              </Show>
              <Show when={compaction().usage}>
                <span class="shrink-0">· {compaction().usage}</span>
              </Show>
            </button>
            <Show when={open() && summary()}>
              <div class="max-h-80 overflow-y-auto rounded-md bg-bg-layer-01 px-2 py-1.5 text-meta leading-4 text-text-muted shadow-[inset_0_0_0_0.5px_var(--border-muted)]">
                <Markdown text={summary()} />
              </div>
            </Show>
          </div>
        </Show>
      }
    >
      <div
        data-component="session-compaction-message"
        data-quiet="true"
        data-status="running"
        data-enter={enter()}
        class="my-1 flex w-full min-w-0 items-center gap-2 py-1 text-meta leading-4 text-text-faint"
      >
        <ActivityRing size={14} class="shrink-0 text-text-faint" />
        <TextShimmer text={tr("compactionRunning")} active />
      </div>
    </Show>
  );
}

function previewOf(summary: string) {
  return summary.length > 240 ? `${summary.slice(0, 240)}…` : summary;
}

/** Timeline divider for context compaction. */
function NoticeSeparator(props: {
  notice: NonNullable<TimelineEntry["notice"]>;
  onOpenSession?: (sessionID: string) => void;
}) {
  const tr = useT();
  const text = () => noticeLabel(props.notice, tr);
  const instructions = () => props.notice.source === "instructions";
  const value = () =>
    instructions() ? instructionSourceLabels(props.notice, tr).join(", ") : props.notice.description;
  const link = () =>
    props.notice.source === "subagent" && props.notice.id && props.onOpenSession ? props.notice.id : undefined;
  // The outcome colours the label and, for a failure, adds the warning glyph,
  // matching the reference notice row. An instruction update is informational
  // and stays in the quiet notice tone.
  const tone = () =>
    instructions()
      ? undefined
      : props.notice.state === "error"
        ? "text-state-fg-danger"
        : props.notice.state === "cancelled"
          ? "text-state-fg-warning"
          : props.notice.state
            ? "text-state-fg-success"
            : undefined;
  return (
    <div
      data-slot="session-timeline-notice"
      data-outcome={instructions() ? undefined : props.notice.state}
      class="flex w-full min-w-0 items-center gap-1.5 py-1 text-body leading-5 tracking-[-0.04px] text-text-faint"
    >
      <Show when={props.notice.state === "error"}>
        <TriangleAlert class="size-4 shrink-0 text-state-fg-danger" />
      </Show>
      <Show when={props.notice.state === "cancelled"}>
        <Ban class="size-4 shrink-0 text-state-fg-warning" />
      </Show>
      <Show
        when={link()}
        fallback={
          // Label and data share one line and one text node, so the row truncates
          // as a unit the way the reference notice does.
          <span class="min-w-0 truncate" dir="auto">
            <span class={cn("font-[530]", tone())}>{text()}</span>
            {value() ? ` · ${value()}` : ""}
          </span>
        }
      >
        {(target) => (
          <>
            <button
              type="button"
              onClick={() => props.onOpenSession?.(target())}
              class={cn("min-w-0 truncate text-start font-[530] hover:text-text-base", tone())}
            >
              {text()}
            </button>
            <Show when={value()}>
              <span class="min-w-0 truncate" dir="auto">
                {`· ${value()}`}
              </span>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

function TimelineSeparator(props: { label: string; value?: string; variant?: string }) {
  return (
    <div class="my-2 flex h-8 select-none items-center gap-3 text-text-faint">
      <span class="timeline-separator-line h-px min-w-0 flex-1" />
      <span class="flex min-w-0 items-center gap-1.5 text-body font-[440] tracking-[-0.04px]">
        <span class="shrink-0 truncate">{props.label}</span>
        <Show when={props.value}>
          <span class="min-w-0 truncate text-text-faint" dir="ltr">{props.value}</span>
        </Show>
        <Show when={props.variant && props.variant !== "default"}>
          <span class="flex shrink-0 items-center gap-1">
            <span aria-hidden="true" class="size-1.5 rounded-full bg-current" />
            <span class="capitalize">{props.variant}</span>
          </span>
        </Show>
      </span>
      <span class="timeline-separator-line timeline-separator-line-reverse h-px min-w-0 flex-1" />
    </div>
  );
}

/**
 * The divider an agent or model change draws. Both read as one separator, and
 * a model change carries the provider's own icon and its variant dot, matching
 * the reference timeline.
 */
function SwitchSeparator(props: {
  value: MessageSwitch;
  modelName?: (provider: string, model: string) => string;
}) {
  const tr = useT();
  return (
    <Switch
      fallback={
        <TimelineSeparator
          label={tr("modelSwitchedTo", {
            model: props.value.model
              ? props.modelName
                ? props.modelName(props.value.provider ?? "", props.value.model)
                : props.value.model
              : tr("modelSwitched"),
          })}
        />
      }
    >
      <Match when={props.value.kind === "agent"}>
        <TimelineSeparator label={tr("agentSwitched", { agent: capitalize(props.value.agent ?? "") })} />
      </Match>
    </Switch>
  );
}

/** Live turn status under the last content, kept for as long as the turn runs. */
function RunningStatus(props: { status: TimelineStatus }) {
  const tr = useT();
  const label = () =>
    props.status === "waitingApproval"
      ? tr("statusWaitingApproval")
      : props.status === "waitingAnswer"
        ? tr("statusWaitingAnswer")
        : props.status === "waitingShell"
          ? tr("statusWaitingShell")
          : tr("statusWorking");
  return (
    <div
      data-component="session-working"
      data-status={props.status}
      role="status"
      aria-label={label()}
      class="mt-3 flex h-9 select-none items-center gap-2 pt-3 text-[13px] leading-4 font-[530] tracking-[-0.04px] text-text-faint"
    >
      <TextShimmer active text={label()} />
    </div>
  );
}

function RunFooter(props: { status: NonNullable<ChatState["lastRunStatus"]>; ms?: number }) {
  const label = () =>
    props.status === "completed"
      ? "Completed"
      : props.status === "stopped"
        ? "Stopped"
        : props.status === "max-steps"
          ? "Step limit reached"
          : "Failed";
  return (
    <div class="mt-3 flex select-none items-center gap-2 text-caption text-text-faint">
      <span
        class={`size-1.5 rounded-full bg-current ${
          props.status === "completed"
            ? "text-state-fg-success"
            : props.status === "stopped"
              ? "text-text-faint"
              : props.status === "max-steps"
                ? "text-state-fg-warning"
                : "text-state-fg-danger"
        }`}
      />
      <span>{label()}</span>
      <Show when={(props.ms ?? 0) > 0}>
        <span aria-hidden>·</span>
        <span class="tabular-nums">{formatDuration(props.ms!)}</span>
      </Show>
    </div>
  );
}
