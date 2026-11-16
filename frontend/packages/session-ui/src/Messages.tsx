import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, memo, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, Ban, ChevronDown, Copy, GitFork, History, Image as ImageIcon, MessageSquare, RotateCcw, Search, TriangleAlert, X } from "@lingzhu/ui/icons";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { LinkedText } from "@lingzhu/ui/LinkedText";
import { TextShimmer } from "@lingzhu/ui/TextShimmer";
import { CopyButton, Markdown } from "./Markdown";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { FileGroup, LoadedRow, ReadGroup, ReasoningRow, SessionShellMessage, ToolBlock, ToolScopeProvider, ToolStandalone, BasicTool, useDisclosure } from "./ToolPart";
import type { ShellOutputSource } from "./ToolPart";
import { attachmentContextLabel, attachmentName, attachmentTypeLabel } from "@lingzhu/ui/attachments";
import { timelineRows, type TimelineRow, type TurnTotals } from "@lingzhu/session-ui/timeline";
import { timelineStatus, type TimelineStatus } from "@lingzhu/session-ui/status";
import { summarizeEvents, type TimelineEvent, type TimelineEventVerb } from "@lingzhu/session-ui/events";
import { noticeLabel } from "@lingzhu/session-ui/notice";
import { MessageNav, messageNavItems } from "@lingzhu/session-ui/MessageNav";
import { createTimelineVirtualizer, timelineVirtualDefaults, type VirtualItem } from "@lingzhu/session-ui/timeline-virtual";
import { trackNestedRails } from "@lingzhu/session-ui/nested-rail";
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
import type { ChatState, EntryAttachment, MessageSwitch, PromptComment, TimelineDetailInput, TimelineEntry, ToolRun } from "@lingzhu/ui/types";
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
function useSpring(target: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const velocity = useRef(0);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      const force = -180 * (current.current - target) - 26 * velocity.current;
      velocity.current += force * dt;
      current.current += velocity.current * dt;
      if (Math.abs(current.current - target) < 0.001 && Math.abs(velocity.current) < 0.001) {
        current.current = target;
        setValue(target);
        return;
      }
      setValue(current.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

export function Messages({
  chat,
  workspace,
  runningSubagents,
  shellOutput,
  bottomInset = 0,
  onLoadOlder,
  header,
  modelLabel,
  modelName,
  onReview,
  onOpenFile,
  onOpenSession,
  onQuote,
  onUndo,
  onRevert,
  onFork,
  canUndo,
  detail = "compact",
  foldLongMessages = true,
  showTurnDiffs = true,
  showAgent = false,
  onCloseMissing,
}: {
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
  header?: ReactNode;
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
  const container = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // The last observed offset, so growth below the viewport is not mistaken for
  // the reader scrolling up.
  const lastScrollTop = useRef(0);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const [occurrences, setOccurrences] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [measureTick, bumpMeasure] = useReducer((value: number) => value + 1, 0);
  const t = useT();
  const rowKeys = useRef<string[]>([]);
  const railRoot = useRef<HTMLDivElement>(null);
  const virtualizer = useRef<ReturnType<typeof createTimelineVirtualizer> | null>(null);
  if (!virtualizer.current) {
    virtualizer.current = createTimelineVirtualizer({
      count: 0,
      getScrollElement: () => container.current,
      getItemKey: (index) => rowKeys.current[index] ?? String(index),
      onChange: bumpMeasure,
    });
  }

  // Sticky tool headers must stop below the session header instead of sliding
  // under it. The height is a theme token, so changing the header does not
  // leave a stale hard-coded inset behind.
  const headerInset = header ? "var(--session-header-height, 48px)" : "0px";

  // A `#message-<id>` hash reveals that prompt once the rows exist, and the
  // transcript keeps its own scroll position when the browser would restore one.
  const revealed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    const reveal = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#message-")) return;
      const id = decodeURIComponent(hash.slice("#message-".length));
      if (!id || revealed.current === id) return;
      const target = container.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if (!target) return;
      revealed.current = id;
      target.scrollIntoView({ block: "start" });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [chat.entries.length]);

  const scrollToEnd = () => {
    const element = container.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  };

  // Switching sessions starts at the newest content, never at the previous
  // session's scroll offset.
  useEffect(() => {
    pinned.current = true;
    setAwayFromBottom(false);
    setSearchOpen(false);
    setQuery("");
    setHit(0);
    scrollToEnd();
  }, [chat.id]);

  // Mod+F opens the transcript find bar, as in the reference timeline.
  useEffect(() => {
    const onFind = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      setSearchOpen(true);
      window.setTimeout(() => {
        input.current?.focus();
        input.current?.select();
      });
    };
    window.addEventListener("keydown", onFind);
    return () => window.removeEventListener("keydown", onFind);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      input.current?.focus();
      return;
    }
    setQuery("");
    setHit(0);
  }, [searchOpen]);

  // Following is a plain flag, as in the reference: the reader's own upward
  // input detaches at the moment it happens, and only arriving at the end
  // reattaches. A time window would misread a fast scroll back to the end.
  useEffect(() => {
    if (chat.running) return;
    const element = container.current;
    if (!element) return;
    const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight <= 1;
    if (atEnd) {
      pinned.current = true;
      setAwayFromBottom(false);
    }
  }, [chat.running]);

  useEffect(() => {
    if (pinned.current) scrollToEnd();
  }, [chat.entries]);

  // History arrives after the first paint; pin again once it is rendered.
  useEffect(() => {
    if (chat.loading) return;
    if (pinned.current) scrollToEnd();
  }, [chat.loading]);

  // The composer grows with its content; keeping the bottom pinned on container
  // resizes prevents the last message from jumping out of view while typing.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      if (pinned.current) element.scrollTop = element.scrollHeight;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The reader's own input detaches immediately, at the moment it happens.
  // Waiting for the resulting scroll event races the stream: an entry that
  // arrives between the wheel and the scroll would scroll back to the end
  // first, and the reader would be dragged down.
  const detach = () => {
    pinned.current = false;
    setAwayFromBottom(true);
  };
  useEffect(() => {
    const element = container.current;
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
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("keydown", onKey);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const onScroll = () => {
    const element = container.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    // Arriving at the end always reattaches, whatever the reader did before:
    // they asked to see the newest content.
    if (distance <= 1) {
      pinned.current = true;
      setAwayFromBottom(false);
      return;
    }
    // The wheel handler already detached. Here, only an actual upward move
    // counts: growth below the viewport raises `scrollHeight` without moving
    // `scrollTop`, and that must not stop following.
    if (element.scrollTop < lastScrollTop.current - 0.5) detach();
    lastScrollTop.current = element.scrollTop;
  };

  // PageUp/PageDown move 80% of the visible area, measured above the floating
  // composer, as the reference timeline does.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    const element = container.current;
    if (!element) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (target?.isContentEditable) return;
    event.preventDefault();
    const page = Math.max(0, element.clientHeight - bottomInset);
    const delta = (event.key === "PageDown" ? 1 : -1) * page * 0.8;
    // `scrollBy` is missing in jsdom; assigning scrollTop keeps the same result.
    if (typeof element.scrollBy === "function") element.scrollBy({ top: delta, behavior: "instant" });
    else element.scrollTop += delta;
  };

  const toBottom = () => {
    const element = container.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    pinned.current = true;
    setAwayFromBottom(false);
  };

  /** Jumps to one prompt, whichever row the transcript currently mounts. */
  const jumpToMessage = (key: string) => {
    const element = container.current;
    if (!element) return;
    pinned.current = false;
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

  const empty = chat.entries.length === 0;
  // The status row belongs to the whole turn. Hiding it whenever text streamed
  // made it blink in and out at every phase change (first token, tool call,
  // reasoning), so it now stays for as long as the turn is running.
  const working = chat.running;
  // What the line says: a permission or question outranks the running call.
  const pendingCount = chat.pending.length;
  const questionCount = chat.questions.length;
  const status = useMemo(
    () =>
      timelineStatus({
        blocked: pendingCount > 0 ? "approval" : questionCount > 0 ? "answer" : undefined,
        entries: chat.entries,
      }),
    [pendingCount, questionCount, chat.entries],
  );
  // The projection only changes with the transcript itself. The virtualizer
  // re-renders this component on every scroll frame, so rebuilding the rows
  // (and the diff tallies the navigator derives from them) would otherwise run
  // on each one.
  const projectedRows = useMemo(
    () =>
      timelineRows(chat.entries, detail, {
        running: chat.running,
        showTurnDiffs,
        retry: chat.retry,
        error: chat.error,
      }),
    [chat.entries, detail, chat.running, showTurnDiffs, chat.retry, chat.error],
  );
  // A fresh projection allocates every row object, which would defeat the row
  // memo. Rows whose payload is unchanged keep the object they had, so only the
  // streaming row reaches the renderer.
  const rowCache = useRef(new Map<string, TimelineRow>());
  const rowCacheOwner = useRef(chat.id);
  const allRows = useMemo(() => {
    // Row keys are only unique within one session; a switch starts fresh so a
    // row from the previous transcript can never be reused.
    const previous = rowCacheOwner.current === chat.id ? rowCache.current : new Map<string, TimelineRow>();
    rowCacheOwner.current = chat.id;
    const next = new Map<string, TimelineRow>();
    const stable = projectedRows.map((row) => {
      const prior = previous.get(row.key);
      const kept = prior && sameRowPayload(prior, row) ? prior : row;
      next.set(row.key, kept);
      return kept;
    });
    rowCache.current = next;
    return stable;
  }, [projectedRows, chat.id]);
  // Older history is folded behind a reveal row at the top; the newest page is
  // always mounted, matching the reference's near-top paging.
  const historyLimit = chat.historyLimit ?? 0;
  const hiddenRows = historyLimit > 0 ? Math.max(0, allRows.length - historyLimit) : 0;
  const rows = useMemo(
    () => (hiddenRows > 0 ? allRows.slice(hiddenRows) : allRows),
    [allRows, hiddenRows],
  );
  const lastUserIndex = useMemo(
    () => rows.reduce((last, row, index) => (row.entry?.role === "user" ? index : last), -1),
    [rows],
  );
  // The reference marks a turn's last assistant part as busy, so its summary
  // block reads as working until the turn moves past it. Tracking the last
  // group alone would keep shimmering under a reply that already followed it.
  const lastAssistantPartRow = useMemo(
    () =>
      rows.reduce((last, row, index) => {
        const assistantPart =
          row.parts ||
          row.read ||
          row.files ||
          row.tool ||
          row.entry?.role === "assistant" ||
          row.entry?.role === "reasoning";
        return assistantPart ? index : last;
      }, -1),
    [rows],
  );
  const busyContextRow = chat.running && rows[lastAssistantPartRow]?.parts ? lastAssistantPartRow : -1;
  // The navigator lists prompts only, so a turn's ticks line up with the
  // scroll targets the hash reveal and `jumpToMessage` already use. It tallies
  // every turn's diff, so it is rebuilt only when the rows change.
  const navItems = useMemo(() => messageNavItems(rows), [rows]);
  const navCurrent = lastUserIndex >= 0 ? rows[lastUserIndex]?.entry?.key : undefined;
  const isAssistantRow = (row: TimelineRow) =>
    Boolean(
      row.diff ||
        row.parts ||
        row.read ||
        row.files ||
        row.tool ||
        row.events ||
        row.entry?.role === "reasoning" ||
        row.entry?.role === "assistant" ||
        row.entry?.role === "loaded",
    );
  const isToolLikeRow = (row: TimelineRow) =>
    Boolean(
      row.diff ||
        row.parts ||
        row.read ||
        row.files ||
        row.tool ||
        row.events ||
        row.entry?.role === "reasoning" ||
        row.entry?.role === "shell" ||
        // A separate notice is a status line about a tool run, so the next tool
        // block keeps the tight tool gap instead of the 16px content gap that
        // would read as a divider between two groups.
        row.entry?.role === "notice",
    );
  const spacing = useMemo(() => {
    const spacingFor = (row: TimelineRow, index: number) => {
      if (row.retry) return index === 0 ? "" : "pt-3";
      if (row.error) return index === 0 ? "" : "pt-6";
      if (row.divider) return index === 0 ? "" : "pt-2";
      if (!isAssistantRow(row) || index === 0) return "";
      // A separate thinking row sits 12px under its prompt, as the reference does.
      if (row.entry?.role === "reasoning") return "pt-3";
      const previous = rows[index - 1];
      if (!previous) return "";
      // The reference gives the first assistant content 24px under its prompt,
      // 8px after a tool group and 16px after earlier content.
      if (previous.entry?.role === "user") return "pt-6";
      return isToolLikeRow(previous) ? "pt-2" : "pt-4";
    };
    return rows.map(spacingFor);
  }, [rows]);
  const spacingFor = (row: TimelineRow, index: number) => spacing[index] ?? "";
  const needle = query.trim().toLowerCase();
  // Searching scans every row's text, including tool output, so it is redone
  // only when the term or the rows change rather than on each render.
  const hits = useMemo(
    () => (needle ? rows.filter((row) => rowSearchText(row).toLowerCase().includes(needle)).map((row) => row.key) : []),
    [needle, rows],
  );

  // Every occurrence is highlighted through the CSS Custom Highlight API, with
  // the active match in its own registry, so the transcript is not re-rendered.
  useEffect(() => {
    const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
    const root = container.current;
    if (!registry || !root) return;
    registry.delete("timeline-search");
    registry.delete("timeline-search-active");
    if (!searchOpen || !needle) {
      setOccurrences(0);
      return;
    }

    const HighlightCtor = (globalThis as { Highlight?: new () => object }).Highlight;
    if (!HighlightCtor) {
      // jsdom has no Highlight; the count still reflects real occurrences.
      const total = occurrencesIn(root, needle);
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
      let at = text.indexOf(needle);
      while (at >= 0) {
        const range = new Range();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        if (index === hit) active.add(range);
        all.add(range);
        index += 1;
        at = text.indexOf(needle, at + needle.length);
      }
      node = walker.nextNode();
    }
    if (index > 0) {
      registry.set("timeline-search", all as never);
      if ((active.size ?? 0) > 0) registry.set("timeline-search-active", active as never);
    }
    setOccurrences(index);
    return () => {
      registry.delete("timeline-search");
      registry.delete("timeline-search-active");
    };
  }, [searchOpen, needle, hit, chat.entries, rows.length]);

  // Long transcripts mount only the rows near the viewport; the vendored
  // TanStack core owns absolute placement, measurement and scroll anchoring.
  // Find keeps the same engine so matches never remount the transcript. A short
  // transcript stays fully mounted: the "Load older" reveal needs every row in
  // the DOM, and mounting a handful costs less than the engine's bookkeeping.
  const virtual = rows.length > 60;
  const rowCount = rows.length;
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  rowKeys.current = keys;
  const engine = virtualizer.current!;
  void measureTick;

  // Options only change with the row count, so the virtualizer is reconfigured
  // when that changes instead of on every scroll frame it triggers.
  const configuredCount = useRef(-1);
  useEffect(() => {
    if (configuredCount.current !== rowCount) {
      configuredCount.current = rowCount;
      engine.setOptions({
        ...timelineVirtualDefaults,
        count: rowCount,
        getScrollElement: () => container.current,
        getItemKey: (index) => rowKeys.current[index] ?? String(index),
        estimateSize: () => 84,
        overscan: 8,
        onChange: bumpMeasure,
        initialRect: { width: 0, height: 0 },
        scrollMargin: 0,
        gap: 0,
      });
    }
    engine._willUpdate();
  });

  useLayoutEffect(() => {
    const cleanup = engine._didMount();
    return cleanup;
  }, [engine]);

  useEffect(() => {
    if (virtual && pinned.current) engine.scrollToEnd();
  }, [engine, rows.length, virtual]);

  // Rails follow real ink, so they must be re-measured when rows mount, grow or
  // collapse. The tracker also owns the hover highlight and strip clicks, and
  // it survives every scroll frame: only a re-measure is requested, never a new
  // listener set.
  const rails = useRef<{ schedule: () => void; dispose: () => void } | null>(null);
  useEffect(() => {
    const root = railRoot.current;
    if (!root) return;
    const tracker = trackNestedRails(root);
    rails.current = tracker;
    return () => {
      tracker.dispose();
      rails.current = null;
    };
  }, []);
  useEffect(() => {
    rails.current?.schedule();
  }, [rowCount, measureTick, virtual]);

  const virtualItems: VirtualItem[] = virtual ? engine.getVirtualItems() : [];

  // A hit scrolls into view; the CSS highlight marks every occurrence, with the
  // active one in its own registry.
  useEffect(() => {
    if (!searchOpen || hits.length === 0) return;
    const key = hits[Math.min(hit, hits.length - 1)];
    const target = container.current?.querySelector<HTMLElement>(`[data-search-key="${key}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, needle, hit, hits.length, chat.entries]);
  // Every finished turn's final assistant text carries its own footer, so
  // switching models later never rewrites old replies.
  const turnFooterRows = useMemo(() => {
    const found = new Set<number>();
    let lastInTurn = -1;
    let turnRunning = false;
    rows.forEach((row, index) => {
      if (row.entry?.role === "user") {
        if (lastInTurn >= 0 && !turnRunning) found.add(lastInTurn);
        lastInTurn = -1;
        turnRunning = false;
        return;
      }
      if (row.entry?.role === "assistant" && row.entry.text) lastInTurn = index;
      if (row.retry || row.error) turnRunning = true;
    });
    const open = chat.running || Boolean(chat.retry) || Boolean(chat.error);
    if (lastInTurn >= 0 && !open) found.add(lastInTurn);
    return found;
  }, [rows, chat.running, chat.retry, chat.error]);
  const seconds = chat.lastRunMs ? chat.lastRunMs / 1000 : 0;
  const speed = !chat.running && seconds > 0 && chat.usage?.output ? chat.usage.output / seconds : undefined;
  // A turn's sources scan its tool arguments and outputs, so they are collected
  // once per transcript instead of once per footer on every render.
  const sourcesByRow = useMemo(() => {
    const found = new Map<number, SourceItem[]>();
    for (const index of turnFooterRows) {
      const sources = turnSources(rows, index);
      if (sources.length > 0) found.set(index, sources);
    }
    return found;
  }, [rows, turnFooterRows]);
  const renderRow = (row: TimelineRow, index: number) => (
    <TimelineRowView
      row={row}
      busy={index === busyContextRow}
      runTop={row.entry?.role === "user" && joinsRun(rows[index - 1]?.entry, row.entry)}
      runBottom={row.entry?.role === "user" && joinsRun(row.entry, rows[index + 1]?.entry)}
      latest={index === lastUserIndex}
      footer={turnFooterRows.has(index)}
      sources={sourcesByRow.get(index)}
      detail={detail}
      modelLabel={modelLabel}
      modelName={modelName}
      showAgent={showAgent}
      canUndo={canUndo}
      foldLongMessages={foldLongMessages}
      running={chat.running}
      lastRunMs={chat.lastRunMs}
      lastRunStatus={chat.lastRunStatus}
      speed={speed}
      workspace={workspace}
      runningSubagents={runningSubagents}
      shellOutput={shellOutput}
      onReview={onReview}
      onOpenFile={onOpenFile}
      onOpenSession={onOpenSession}
      onUndo={onUndo}
      onRevert={onRevert}
      onFork={onFork}
    />
  );

  if (chat.notFound) {
    return (
      <div className="flex-1 overflow-y-auto py-inset-panel">
        <SessionMissing onClose={onCloseMissing} />
      </div>
    );
  }

  if (chat.loading && empty) {
    return (
      <div className="flex-1 overflow-y-auto py-inset-panel">
        <div role="status" aria-label={t("loadingConversation")} className="mx-auto flex w-full max-w-session flex-col gap-6 px-4 md:px-6">
          {[0, 1, 2].map((index) => (
            <div key={index} aria-hidden className="flex flex-col gap-2">
              <div className={`h-2 rounded-xs bg-bg-layer-02 motion-safe:animate-pulse ${index === 1 ? "w-2/3" : "w-1/2"}`} />
              <div className="h-2 w-full rounded-xs bg-bg-layer-01 motion-safe:animate-pulse" />
              <div className="h-2 w-4/5 rounded-xs bg-bg-layer-01 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ToolScopeProvider scope={chat.id}>
    <div className="relative flex min-h-0 flex-1 flex-col">
      {searchOpen && (
        <div
          data-component="timeline-search-bar"
          className="absolute end-6 top-2 z-30 flex h-7 w-[200px] max-w-[50vw] items-center gap-1.5 rounded-md border-[0.5px] border-border-base bg-bg-layer-01 px-1.5 shadow-elevation-raised"
        >
          <Search className="size-3.5 shrink-0 text-text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHit(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setSearchOpen(false);
                return;
              }
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (hits.length === 0) return;
                setHit((current) => {
                  const next = current + (event.shiftKey ? -1 : 1);
                  return ((next % hits.length) + hits.length) % hits.length;
                });
                return;
              }
              if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (hits.length === 0) return;
                const delta = event.key === "ArrowDown" ? 1 : -1;
                setHit((current) => ((current + delta + hits.length) % hits.length));
              }
            }}
            type="search"
            aria-label={t("searchTranscript")}
            placeholder={t("searchTranscript")}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[13px] leading-4 text-text-base outline-none placeholder:text-text-faint"
          />
          {needle && (
            <span className="shrink-0 text-[11px] leading-4 font-[440] tabular-nums text-text-muted">
              {occurrences === 0 ? 0 : Math.min(hit + 1, occurrences)}/{occurrences}
            </span>
          )}
          <button
            type="button"
            aria-label={t("closeSearch")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setSearchOpen(false)}
            className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div
          ref={container}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          tabIndex={-1}
          aria-busy={chat.running}
          data-virtualized={virtual ? "true" : undefined}
          data-virtual-range={
            virtual && virtualItems.length > 0
              ? `${virtualItems[0].index}-${virtualItems[virtualItems.length - 1].index}`
              : undefined
          }
          className="scroll-stable-both min-h-0 flex-1 overflow-y-auto pb-4"
          style={{ "--sticky-accordion-top": headerInset } as CSSProperties}
        >
        {header && (
          <div
            data-slot="session-sticky-header"
            className="sticky top-0 z-30 bg-bg-base before:pointer-events-none before:absolute before:inset-x-0 before:top-full before:h-4 before:bg-[linear-gradient(to_bottom,var(--bg-base),transparent)]"
          >
            {header}
          </div>
        )}
        <div
          className="mx-auto flex w-full max-w-session flex-col px-4 pt-6 md:px-6"
          ref={railRoot}
          style={bottomInset > 0 ? { paddingBottom: bottomInset + 16 } : undefined}
        >
          {empty && <EmptyState />}

          {hiddenRows > 0 && onLoadOlder && (
            <button
              type="button"
              data-slot="timeline-load-older"
              onClick={onLoadOlder}
              className="interactive mb-2 flex h-7 shrink-0 items-center justify-center rounded-md text-body font-[440] text-text-muted hover:text-text-base"
            >
              {t("loadOlder")}
            </button>
          )}

          {virtual ? (
            <div
              data-slot="timeline-virtual-content"
              style={{ position: "relative", height: engine.getTotalSize() }}
            >
              {virtualItems.map((item) => {
                const row = rows[item.index];
                if (!row) return null;
                return (
                  <div
                    key={row.key}
                    ref={engine.measureElement}
                    data-index={item.index}
                    data-row-key={row.key}
                    data-search-key={row.key}
                    data-message-id={row.entry?.role === "user" ? row.entry.key : undefined}
                    id={row.entry?.role === "user" ? `message-${row.entry.key}` : undefined}
                    className={spacingFor(row, item.index)}
                    style={{
                      position: "absolute",
                      // Keep `top` rather than `transform`: a transformed row
                      // becomes the containing block for sticky tool headers,
                      // so they would scroll away instead of masking the top.
                      top: item.start,
                      left: 0,
                      width: "100%",
                    }}
                  >
                    {renderRow(row, item.index)}
                  </div>
                );
              })}
            </div>
          ) : (
            rows.map((row, index) => (
              <div
                key={row.key}
                data-row-key={row.key}
                data-search-key={row.key}
                data-message-id={row.entry?.role === "user" ? row.entry.key : undefined}
                id={row.entry?.role === "user" ? `message-${row.entry.key}` : undefined}
                className={spacingFor(row, index)}
              >
                {renderRow(row, index)}
              </div>
            ))
          )}

          {working && <RunningStatus status={status} />}

          {chat.notice && <TimelineSeparator label={chat.notice} />}

          {chat.lastRunStatus && !chat.running && chat.lastRunStatus !== "completed" && (
            <RunFooter status={chat.lastRunStatus} ms={chat.lastRunMs} />
          )}
        </div>
        {onQuote && <SelectionQuote root={container} onQuote={onQuote} />}
      </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-[linear-gradient(to_bottom,var(--bg-base),transparent)]"
        />
      </div>

      {awayFromBottom && (
        <button
          type="button"
          onClick={toBottom}
          aria-label={t("scrollToLatest")}
          style={{ bottom: bottomInset + 16 }}
          className="interactive absolute right-6 z-10 grid size-control-md place-items-center rounded-full border border-border-strong bg-bg-layer-02 text-text-muted"
        >
          <ArrowDown className="size-4" />
        </button>
      )}
      <MessageNav items={navItems} current={navCurrent} onSelect={jumpToMessage} />
    </div>
    </ToolScopeProvider>
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
function SelectionQuote({ root, onQuote }: { root: RefObject<HTMLDivElement | null>; onQuote: (text: string) => void }) {
  const tr = useT();
  const [spot, setSpot] = useState<SelectionSpot>();

  useEffect(() => {
    const node = root.current;
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
    return () => {
      node.removeEventListener("pointerup", update);
      node.removeEventListener("keyup", update);
      node.removeEventListener("scroll", hide, true);
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("keydown", onKey);
    };
  }, [root]);

  if (!spot) return null;
  const above = spot.top > 64;
  return createPortal(
    <div
      data-component="selection-quote"
      role="toolbar"
      aria-label={tr("quoteSelection")}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      style={{
        left: spot.x,
        top: above ? spot.top : spot.bottom,
        transform: `translate(-50%, ${above ? "calc(-100% - 8px)" : "8px"})`,
      }}
      className="elevation-floating fixed z-50 flex select-none items-center gap-0.5 rounded-lg bg-bg-layer-01 p-0.5"
    >
      <button
        type="button"
        data-slot="selection-quote-add"
        onClick={() => {
          onQuote(spot.text);
          window.getSelection()?.removeAllRanges();
          setSpot(undefined);
        }}
        className="interactive flex h-6 items-center gap-1 rounded-xs px-1.5 text-caption font-[530] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
      >
        <MessageSquare className="size-3.5 text-text-faint" />
        Add
      </button>
    </div>,
    document.body,
  );
}

const TURN_DIFF_FILES = 5;

/** Changed-file summary that follows a completed turn. */
function TurnDiffSummary({
  totals,
  detail,
  groupKey,
  onReview,
}: {
  totals: TurnTotals;
  detail: TimelineDetailInput;
  groupKey: string;
  onReview?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const patch = totals.patch ?? "";
  const tool: ToolRun | undefined = patch
    ? { id: `${groupKey}:patch`, name: "patch", arguments: "{}", diff: patch, done: true }
    : undefined;
  return (
    <div data-component="turn-diff" className="flex flex-col gap-2">
      <div className="flex h-6 min-w-0 items-center gap-2">
        <span className="shrink-0 text-reading leading-5 font-[530] text-text-base tabular-nums">
          {totals.files} {totals.files === 1 ? "file" : "files"} changed
        </span>
        <span className="flex shrink-0 items-center justify-end gap-2" dir="ltr">
          <span className="text-caption leading-none font-[440] tracking-[0.05px] text-state-fg-success">
            +{totals.added}
          </span>
          <span className="text-caption leading-none font-[440] tracking-[0.05px] text-state-fg-danger">
            -{totals.removed}
          </span>
        </span>
        <div className="ms-auto flex shrink-0 items-center gap-3">
          {totals.files > TURN_DIFF_FILES && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="interactive text-reading leading-5 font-[440] text-text-accent hover:text-text-accent"
            >
              {showAll ? "Show less" : "Show all"}
            </button>
          )}
          {onReview && (
            <button
              type="button"
              onClick={onReview}
              className="interactive text-reading leading-5 font-[440] text-text-accent hover:text-text-accent"
            >
              Review
            </button>
          )}
        </div>
      </div>
      {tool && (
        <FileGroup
          tools={[tool]}
          detail={detail}
          groupKey={`${groupKey}:diff`}
          showHeader={false}
          limit={showAll ? undefined : TURN_DIFF_FILES}
        />
      )}
    </div>
  );
}

function EmptyState() {
  const tr = useT();
  return (
    <div className="select-none py-24 text-center">
      <p className="text-reading text-text-base">{tr("emptyTranscriptTitle")}</p>
      <p className="mx-auto mt-2 max-w-measure-narrow text-body leading-5 text-text-faint">
        {tr("emptyTranscriptHint")}
      </p>
    </div>
  );
}

/** The session the core no longer has: a deleted row that a cached list kept. */
function SessionMissing({ onClose }: { onClose?: () => void }) {
  const tr = useT();
  return (
    <div data-component="session-missing" className="select-none py-24 text-center">
      <p className="text-reading text-text-base">{tr("sessionNotFoundTitle")}</p>
      <p className="mx-auto mt-2 max-w-measure-narrow text-body leading-5 text-text-faint">
        {tr("sessionNotFoundHint")}
      </p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="interactive mt-6 inline-flex h-control-md items-center rounded-md border-[0.5px] border-border-base bg-bg-layer-01 px-control text-body font-[440] text-text-base hover:bg-bg-layer-02"
        >
          {tr("sessionNotFoundClose")}
        </button>
      )}
    </div>
  );
}

/** The text a transcript search matches: message text plus tool arguments and output. */
function rowSearchText(row: TimelineRow): string {
  if (row.diff) return "";
  if (row.retry) return row.retry.message;
  if (row.error) return row.error;
  if (row.events) return row.events.map((event) => [event.kind, event.title ?? "", event.agent ?? ""].join("\n")).join("\n");
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
    sameItems(left.files, right.files) &&
    sameItems(left.events, right.events)
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
function EntryView({
  entry,
  meta,
  showCopy,
  sources,
  userMeta,
  metaHidden,
  latest,
  onOpenFile,
  onUndo,
  onRevert,
  onFork,
  canUndo,
  detail,
  runTop,
  runBottom,
  foldLongMessages,
  onOpenSession,
  working,
}: {
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
  if (entry.role === "loaded" && entry.loaded) {
    return <LoadedInstructions paths={entry.loaded} />;
  }
  if (entry.role === "notice" && entry.notice) {
    return <NoticeSeparator notice={entry.notice} onOpenSession={onOpenSession} />;
  }
  if (entry.role === "notice" && entry.text) {
    return <TimelineSeparator label={entry.text} />;
  }
  if (entry.role === "reasoning") {
    return <ReasoningRow entry={entry} detail={detail} />;
  }
  if (entry.role === "compaction") {
    return <CompactionMessage entry={entry} working={working} />;
  }
  if (entry.role === "shell" && entry.shell) {
    return (
      <div className="mt-3">
        <SessionShellMessage shell={entry.shell} entryKey={entry.key} detail={detail} />
      </div>
    );
  }
  if (entry.role === "user") {
    return (
      <UserBubble
        text={entry.text ?? ""}
        attachments={entry.attachments}
        references={entry.references}
        comments={entry.comments}
        voice={entry.voice}
        pending={entry.pending}
        steer={entry.steer}
        created={entry.created}
        meta={userMeta}
        metaHidden={metaHidden}
        latest={latest}
        runTop={runTop}
        runBottom={runBottom}
        onUndo={onUndo}
        onRevert={onRevert}
        onFork={onFork}
        canUndo={canUndo}
        foldLongMessages={foldLongMessages}
      />
    );
  }
  if (!entry.text) return null;
  return (
    <AssistantText
      text={entry.text}
      meta={meta}
      showCopy={showCopy}
      sources={sources}
      onOpenFile={onOpenFile}
      streaming={entry.live}
    />
  );
}

/**
 * One transcript row. The projection hands every row a stable identity while
 * only the last one streams, so memoizing here keeps a delta from re-rendering
 * the rest of a long session.
 *
 * The comparison is the default one: every prop is either primitive, a stable
 * store object (a row, a tool run) or a callback the pane keeps stable.
 */
const TimelineRowView = memo(function TimelineRowView({
  row,
  busy,
  runTop,
  runBottom,
  latest,
  footer,
  sources,
  detail,
  modelLabel,
  modelName,
  showAgent,
  canUndo,
  foldLongMessages,
  running,
  lastRunMs,
  lastRunStatus,
  speed,
  workspace,
  runningSubagents,
  shellOutput,
  onReview,
  onOpenFile,
  onOpenSession,
  onUndo,
  onRevert,
  onFork,
}: {
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
  lastRunMs?: number;
  lastRunStatus?: ChatState["lastRunStatus"];
  speed?: number;
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
  if (row.diff) {
    return <TurnDiffSummary totals={row.diff} detail={detail} groupKey={row.key} onReview={onReview} />;
  }
  if (row.retry) return <SessionRetryCard retry={row.retry} />;
  if (row.error) return <SessionErrorCard message={row.error} />;
  if (row.divider) {
    return row.dividerSwitch ? (
      <SwitchSeparator value={row.dividerSwitch} modelName={modelName} />
    ) : (
      <TimelineSeparator label={row.divider} />
    );
  }
  if (row.events) return <TimelineEventRow events={row.events} onOpenSession={onOpenSession} />;
  if (row.parts) {
    return (
      <ToolBlock
        parts={row.parts}
        busy={busy}
        onOpenFile={onOpenFile}
        onOpenSession={onOpenSession}
        workspace={workspace}
        runningSubagents={runningSubagents}
        shellOutput={shellOutput}
        detail={detail}
      />
    );
  }
  if (row.read) {
    return (
      <div data-entry="tool">
        <ReadGroup tools={row.read} groupKey={row.key} />
      </div>
    );
  }
  if (row.files) {
    return (
      <div data-entry="tool">
        <FileGroup
          tools={row.files}
          detail={detail}
          groupKey={row.key}
          showHeader={row.files[0]?.name === "edit"}
        />
      </div>
    );
  }
  if (row.tool) {
    return (
      <ToolStandalone
        tool={row.tool}
        onOpenSession={onOpenSession}
        workspace={workspace}
        runningSubagents={runningSubagents}
        shellOutput={shellOutput}
        detail={detail}
      />
    );
  }

  const entry = row.entry!;
  const isUser = entry.role === "user";
  const metaOptions = { showAgent, modelLabel, modelName, running, lastRunMs, lastRunStatus, speed };
  return (
    <EntryView
      entry={entry}
      meta={footer ? turnFooterMeta(entry, metaOptions) : undefined}
      showCopy={footer}
      sources={footer ? sources : undefined}
      userMeta={isUser ? entryMeta(entry, metaOptions) : undefined}
      metaHidden={runBottom}
      latest={latest}
      onOpenFile={onOpenFile}
      onUndo={onUndo}
      onRevert={onRevert}
      onFork={onFork}
      canUndo={canUndo}
      detail={detail}
      runTop={runTop}
      runBottom={runBottom}
      foldLongMessages={foldLongMessages}
      onOpenSession={onOpenSession}
      working={running}
    />
  );
});

/** Labels under one message: who wrote it and, for a finished turn, the run. */
function entryMeta(
  entry: TimelineEntry,
  options: {
    showAgent?: boolean;
    modelLabel?: string;
    modelName?: (provider: string, model: string) => string;
    running: boolean;
    lastRunMs?: number;
    lastRunStatus?: ChatState["lastRunStatus"];
    speed?: number;
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

/** The footer of a finished turn: labels plus how long it took and how fast. */
function turnFooterMeta(
  entry: TimelineEntry,
  options: {
    showAgent?: boolean;
    modelLabel?: string;
    modelName?: (provider: string, model: string) => string;
    running: boolean;
    lastRunMs?: number;
    lastRunStatus?: ChatState["lastRunStatus"];
    speed?: number;
  },
): string[] {
  return [
    ...entryMeta(entry, options),
    !options.running && options.lastRunMs ? formatDuration(options.lastRunMs) : "",
    !options.running && options.lastRunStatus === "stopped" ? t("interrupted") : "",
    options.speed ? `${options.speed.toFixed(1)} tok/s` : "",
  ].filter(Boolean);
}

const USER_MESSAGE_FOLD_OVER = 12;
const USER_MESSAGE_FOLD_SHOW = 8;
const USER_MESSAGE_LINE_HEIGHT = 21;

/**
 * Long prompts fold to eight lines with a mask, the way the reference keeps a
 * pasted block from taking over the transcript.
 */
function UserMessageText({ text, fold = true }: { text: string; fold?: boolean }) {
  const tr = useT();
  const [expanded, setExpanded] = useState(false);
  const long = fold && (text.split("\n").length > USER_MESSAGE_FOLD_OVER || text.length > 1200);
  if (!long) return <>{text}</>;
  return (
    <span className="block">
      <span
        className={`block ${
          expanded
            ? ""
            : "overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%-40px),transparent)]"
        }`}
        style={expanded ? undefined : { maxHeight: `${USER_MESSAGE_FOLD_SHOW * USER_MESSAGE_LINE_HEIGHT}px` }}
      >
        {text}
      </span>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="interactive mt-1 flex h-6 items-center gap-1 rounded-xs text-[13px] leading-5 text-text-muted hover:text-text-base"
      >
        {expanded ? tr("showLess") : tr("messageReadMore")}
        <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
    </span>
  );
}

/** One image attachment thumbnail above the bubble. */
function UserAttachmentImage({ attachment }: { attachment: EntryAttachment }) {
  const name = attachmentName(attachment.name, attachment.mime);
  return (
    <span
      data-slot="user-message-attachment"
      data-type="image"
      className="relative h-[46px] w-[58px] overflow-hidden rounded-md bg-bg-layer-02 text-text-faint shadow-[inset_0_0_0_0.5px_var(--border-base)]"
    >
      {attachment.data ? (
        <img
          src={`data:${attachment.mime};base64,${attachment.data}`}
          alt={name}
          className="size-full object-cover"
        />
      ) : (
        <span className="grid size-full place-items-center">
          <ImageIcon className="size-5" />
        </span>
      )}
    </span>
  );
}

/** One file or directory attachment card above the bubble. */
function UserAttachmentFile({ attachment }: { attachment: EntryAttachment }) {
  const name = attachmentName(attachment.name, attachment.mime);
  const kind = attachment.kind === "directory" ? "directory" : "file";
  return (
    <span
      data-slot="user-message-attachment"
      data-type={kind}
      title={attachment.name ?? name}
      className="flex w-40 min-w-40 max-w-40 flex-col gap-1.5 rounded-md border-[0.5px] border-border-base bg-bg-layer-02 p-2 text-text-muted transition-colors hover:border-border-strong"
    >
      <span className="w-full min-w-0 truncate text-[11px] leading-[14px] font-[530] tracking-[0.05px] text-text-base">
        {name.replace(/\\/g, "/").split("/").pop() ?? name}
      </span>
      <span className="flex min-h-4 min-w-0 items-center gap-1 overflow-hidden text-[11px] leading-[14px] font-[440] tracking-[0.05px] whitespace-nowrap">
        <FileTypeIcon path={attachment.name ?? attachment.mime} type={kind} className="size-3 shrink-0" />
        <span className="min-w-0 truncate">
          {attachmentTypeLabel(name, attachment.mime, attachment.kind)}
          {attachmentContextLabel(attachment) ? ` ${attachmentContextLabel(attachment)}` : ""}
        </span>
      </span>
    </span>
  );
}

/** Attachment row shown above the bubble, images first as they arrive. */
function UserAttachments({ attachments }: { attachments: EntryAttachment[] }) {
  return (
    <div className="mb-2 flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
      {attachments.map((attachment, index) =>
        attachment.mime.startsWith("image/") ? (
          <UserAttachmentImage key={`${attachment.mime}-${index}`} attachment={attachment} />
        ) : (
          <UserAttachmentFile key={`${attachment.mime}-${index}`} attachment={attachment} />
        ),
      )}
    </div>
  );
}

/** Hover-revealed menu with copy, fork, undo and revert for one user turn. */
function UserMessageActions({
  text,
  created,
  pending,
  latest,
  onUndo,
  onRevert,
  onFork,
  canUndo,
}: {
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
      className={`absolute end-[calc(8px+(1lh-20px)/2)] top-[calc(8px+(1lh-20px)/2)] flex rounded-[4px] bg-[linear-gradient(to_left,var(--bg-layer-02)_calc(100%_-_16px),transparent)] pl-4 opacity-0 group-focus-within/bubble:opacity-100 group-hover/bubble:opacity-100 [@media(hover:none)]:opacity-100 ${
        pending ? "bg-[linear-gradient(to_left,var(--bg-layer-01)_calc(100%_-_16px),transparent)]" : ""
      }`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tr("messageMoreActions")}
            className="interactive grid size-5 place-items-center rounded-[4px] text-text-faint hover:text-text-base"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          {created ? (
            <>
              <DropdownMenuLabel className="tabular-nums">{formatMessageTime(created)}</DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(text)}>
            <Copy />
            {tr("messageCopy")}
          </DropdownMenuItem>
          {!pending && onFork && (
            <DropdownMenuItem onSelect={() => onFork(text)}>
              <GitFork />
              {tr("messageFork")}
            </DropdownMenuItem>
          )}
          {!pending &&
            (latest && onUndo ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={canUndo === false} onSelect={() => onUndo(text)}>
                  <RotateCcw />
                  {tr("messageUndo")}
                </DropdownMenuItem>
              </>
            ) : onRevert ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onRevert(text, created)}>
                  <History />
                  {tr("messageRevert")}
                </DropdownMenuItem>
              </>
            ) : null)}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** The rounded surface carrying the user's text and its actions. */
function UserBubbleBody({
  text,
  comments,
  voice,
  pending,
  top,
  bottom,
  foldLongMessages,
  actions,
}: {
  text: string;
  comments?: PromptComment[];
  voice?: boolean;
  pending?: boolean;
  top: number;
  bottom: number;
  foldLongMessages?: boolean;
  actions: ReactNode;
}) {
  const tr = useT();
  return (
    <div
      data-slot="user-message-bubble"
      data-pending={pending ? "true" : undefined}
      data-run-top={top > 0.5 ? "true" : undefined}
      data-run-bottom={bottom > 0.5 ? "true" : undefined}
      style={{
        // The spring drives a continuous radius; the data attributes above
        // carry the settled state so CSS and tests read one contract.
        borderStartEndRadius: `${10 - 6 * top}px`,
        borderEndEndRadius: `${10 - 6 * bottom}px`,
      }}
      className={`user-message-bubble group/bubble relative max-w-[min(82%,64ch)] overflow-hidden rounded-[10px] px-3 py-2 text-[14px] font-[440] leading-[1.5] whitespace-pre-wrap select-text transition-[background-color,color] duration-200 motion-reduce:transition-none ${
        pending ? "bg-bg-layer-01 text-text-muted" : "bg-bg-layer-02 text-text-base"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {voice && (
          <span data-slot="user-message-voice" className="mt-0.5 shrink-0 text-text-faint" aria-label={tr("voicePrompt")}>
            <AudioLines className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <UserMessageText text={text} fold={foldLongMessages} />
        </div>
      </div>
      {comments && comments.length > 0 && (
        <div data-slot="user-message-comments" className="mt-2 flex flex-col gap-1.5">
          {comments.map((comment, index) => (
            <div
              key={comment.id ?? `${comment.file}:${comment.line ?? 0}:${index}`}
              data-component="comment-card"
              className="rounded-md bg-bg-layer-01 px-2 py-1.5 text-start"
            >
              <div className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-text-faint">
                <FileTypeIcon path={comment.file} className="size-3 shrink-0" />
                <span className="truncate">{comment.file}</span>
                {comment.line ? <span className="shrink-0 tabular-nums">:{comment.line}</span> : null}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-meta leading-5 text-text-muted">{comment.body}</div>
            </div>
          ))}
        </div>
      )}
      {actions}
    </div>
  );
}

function AudioLines({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path
        d="M2.5 6.5v3M5.5 4.5v7M8.5 3v10M11.5 5.5v5M14 7v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pending marker and turn metadata under the bubble. */
function UserMessageMeta({
  pending,
  meta,
  progress,
}: {
  pending?: boolean;
  meta?: string[];
  progress: number;
}) {
  const tr = useT();
  const hasMeta = Boolean(meta && meta.length > 0);
  if (!pending && !hasMeta) return null;
  return (
    <div
      data-slot="user-message-meta"
      style={{ maxHeight: `${progress * 20}px`, opacity: progress }}
      className="flex select-none items-center justify-end overflow-hidden"
    >
      <span className="flex min-w-0 items-center gap-1 overflow-hidden text-[12px] leading-[18px] font-[440] tracking-[0.05px] whitespace-nowrap text-text-faint">
        {hasMeta && (
          // The agent and model stay out of the way until the pointer is on the
          // message; Pending is the only label that always shows.
          <span
            data-slot="user-message-meta-label"
            className="flex min-w-0 items-center gap-1 opacity-0 group-focus-within/user:opacity-100 group-hover/user:opacity-100 [@media(hover:none)]:opacity-100"
          >
            {meta!.map((item, index) => (
              <span key={item} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span aria-hidden="true">·</span>}
                <span className="truncate">{item}</span>
              </span>
            ))}
            {pending && <span aria-hidden="true">·</span>}
          </span>
        )}
        {pending && <span data-slot="user-message-pending">{tr("messagePending")}</span>}
      </span>
    </div>
  );
}

/** Right-aligned user bubble with its attachments above, like the reference message surface. */
function UserBubble({
  text,
  attachments,
  references,
  comments,
  voice,
  pending,
  steer,
  created,
  meta,
  metaHidden,
  latest,
  runTop,
  runBottom,
  onUndo,
  onRevert,
  onFork,
  canUndo,
  foldLongMessages,
}: {
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
  const top = useSpring(runTop ? 1 : 0);
  const bottom = useSpring(runBottom ? 1 : 0);
  const metaProgress = useSpring(metaHidden ? 0 : 1);
  return (
    <div
      data-entry="user"
      data-steer={steer ? "true" : undefined}
      style={{ marginTop: `${4 + (1 - top) * 12}px` }}
      className={`group/user flex flex-col items-end${steer ? " steer-arrival" : ""}`}
    >
      {(() => {
        const files = [...(references ?? []), ...(attachments ?? [])];
        return files.length > 0 ? <UserAttachments attachments={files} /> : null;
      })()}
      <UserBubbleBody
        text={text}
        comments={comments}
        voice={voice}
        pending={pending}
        top={top}
        bottom={bottom}
        foldLongMessages={foldLongMessages}
        actions={
          <UserMessageActions
            text={text}
            created={created}
            pending={pending}
            latest={latest}
            onUndo={onUndo}
            onRevert={onRevert}
            onFork={onFork}
            canUndo={canUndo}
          />
        }
      />
      <UserMessageMeta pending={pending} meta={meta} progress={metaProgress} />
    </div>
  );
}

/** Project instruction files included in the prompt for this turn. */
function LoadedInstructions({ paths }: { paths: string[] }) {
  return <LoadedRow paths={paths} />;
}

/** Web sources gathered by this turn, opened from a footer chip. */
function SourcesChip({ sources }: { sources: SourceItem[] }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-component="sources-chip"
        onClick={() => setOpen(true)}
        className="flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-xs px-1 text-[12px] leading-[18px] text-text-faint hover:text-text-base"
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span>{tr("sourcesCount", { count: sources.length })}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4 text-text-muted" aria-hidden="true" />
            {tr("sourcesTitle")}
          </DialogTitle>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex min-w-0 flex-col rounded-sm px-2 py-1.5 hover:bg-bg-layer-02"
              >
                <span className="truncate text-meta leading-4 text-text-base">{source.title}</span>
                <span className="truncate text-[11px] leading-4 text-text-faint">{source.url}</span>
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Assistant reply: full-width Markdown with a hover-revealed copy/meta footer. */
function AssistantText({
  text,
  meta,
  showCopy,
  sources,
  onOpenFile,
  streaming,
}: {
  text: string;
  meta?: string[];
  showCopy?: boolean;
  sources?: SourceItem[];
  onOpenFile?: (path: string) => void;
  streaming?: boolean;
}) {
  return (
    <div data-entry="assistant" className="group/assistant">
      <Markdown text={text} onOpenFile={onOpenFile} streaming={streaming} />
      {showCopy && (
        <div
          data-slot="text-part-copy-wrapper"
          className="mt-2 flex h-5 select-none items-center gap-1 [@media(hover:hover)]:opacity-0 group-focus-within/assistant:opacity-100 group-hover/assistant:opacity-100 [&>*:first-child]:-ms-0.5"
        >
          {sources && sources.length > 0 && <SourcesChip sources={sources} />}
          <CopyButton text={text} label="Copy response" />
          {meta && meta.length > 0 && (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden text-[12px] font-[440] leading-[18px] tracking-[0.05px] whitespace-nowrap text-text-faint">
              {meta.map((item, index) => (
                <span key={item} className="flex min-w-0 items-center gap-1">
                  {index > 0 && <span aria-hidden="true">·</span>}
                  <span className="truncate">{item}</span>
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Automatic provider retry, with the next attempt and the upstream message. */
function SessionRetryCard({ retry }: { retry: NonNullable<ChatState["retry"]> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const at = Date.parse(retry.next);
  const seconds = Number.isFinite(at) ? Math.max(0, Math.round((at - now) / 1000)) : 0;
  const message = retry.message.length > 80 ? `${retry.message.slice(0, 80)}…` : retry.message;
  return (
    <div
      data-component="card"
      data-kind="session-retry-card"
      data-slot="session-turn-retry"
      className="error-card w-full min-w-0"
    >
      <div className="flex w-full items-start gap-2">
        <TriangleAlert className="size-4 shrink-0 text-state-fg-danger" />
        <div className="min-w-0 flex-1">
          <div data-slot="session-turn-retry-message" className="cursor-help truncate" title={retry.message}>
            <SessionErrorMessage message={message} />
          </div>
          <div data-slot="session-turn-retry-info" className="text-meta leading-4 text-text-faint">
            <TextShimmer
              active
              text={`attempt ${retry.attempt}${seconds > 0 ? ` · retrying in ${seconds}s` : " · retrying now"}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Run error, rendered like the reference session error card. */
function SessionErrorCard({ message }: { message: string }) {
  return (
    <div
      data-component="card"
      data-kind="session-error-card"
      className="error-card w-full min-w-0"
    >
      <div className="flex w-full min-w-0 items-start gap-2">
        <TriangleAlert className="shrink-0 text-state-fg-danger" />
        <div className="min-w-0 select-text">
          <SessionErrorMessage message={message} links />
        </div>
      </div>
    </div>
  );
}

/**
 * A run of background subagents and shells, read like a group label: "Started 2
 * subagents · Finished 1 shell". Opening it lists each one; a subagent opens its
 * session and a shell jumps to the call that ran it.
 */
function TimelineEventRow({
  events,
  onOpenSession,
}: {
  events: TimelineEvent[];
  onOpenSession?: (sessionID: string) => void;
}) {
  const tr = useT();
  const summary = summarizeEvents(events);
  const items = events.filter((event) => event.title);
  const [open, setOpen] = useDisclosure(`events:${events[0]?.sessionID ?? events[0]?.shellID ?? "work"}`);

  if (summary.verbs.length === 0) return null;

  return (
    <div data-component="timeline-event-row">
      <BasicTool
        id={`events:${events[0]?.sessionID ?? events[0]?.shellID ?? "work"}`}
        compact
        hasContent={items.length > 0}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <div data-component="context-tool-group-trigger" data-timeline-event="">
            <span data-slot="context-tool-group-title" data-activity="">
              {summary.verbs.map((bucket, index) => (
                <span key={bucket.verb} className="contents">
                  {index > 0 && <span data-slot="context-tool-group-separator">·</span>}
                  <span data-slot="context-tool-group-verb">{tr(verbKey(bucket.verb))}</span>
                  <span data-slot="context-tool-group-detail">
                    {" "}
                    {bucket.kinds
                      .map((item) =>
                        tr(
                          item.count === 1
                            ? item.kind === "subagent"
                              ? "eventSubagentOne"
                              : "eventShellOne"
                            : item.kind === "subagent"
                              ? "eventSubagentMany"
                              : "eventShellMany",
                          { count: item.count },
                        ),
                      )
                      .join(", ")}
                  </span>
                </span>
              ))}
              {summary.failed > 0 && (
                <span data-slot="timeline-event-failed" className="text-state-fg-danger">
                  {summary.failed === events.length
                    ? tr("eventAllFailed")
                    : tr("eventFailedCount", { count: summary.failed })}
                </span>
              )}
            </span>
          </div>
        }
      >
        <div data-component="timeline-event-list">
          {items.map((event, index) => (
            <TimelineEventItem
              key={`${event.kind}:${event.sessionID ?? event.shellID ?? index}`}
              event={event}
              onOpenSession={onOpenSession}
            />
          ))}
        </div>
      </BasicTool>
    </div>
  );
}

function verbKey(verb: TimelineEventVerb) {
  return verb === "started"
    ? ("eventStarted" as const)
    : verb === "finished"
      ? ("eventFinished" as const)
      : verb === "stopped"
        ? ("eventStopped" as const)
        : ("eventStarted" as const);
}

/** One background subagent or shell an events row lists: who did it and what. */
function TimelineEventItem({
  event,
  onOpenSession,
}: {
  event: TimelineEvent;
  onOpenSession?: (sessionID: string) => void;
}) {
  const tr = useT();
  const name = event.kind === "shell" ? tr("toolShell") : capitalize(event.agent ?? tr("toolAgent"));
  const clickable = Boolean(event.sessionID && onOpenSession);
  return (
    <button
      type="button"
      data-slot="timeline-event-item"
      data-kind={event.kind}
      disabled={!clickable}
      onClick={() => event.sessionID && onOpenSession?.(event.sessionID)}
      className="flex min-w-0 items-center gap-2 py-0.5 text-start text-meta leading-4 text-text-faint disabled:cursor-default"
    >
      <span data-slot="timeline-event-item-name" className="shrink-0 text-text-muted">
        {name}
      </span>
      <span data-slot="timeline-event-item-title" className="min-w-0 truncate">
        {event.title}
      </span>
      {event.failed && <span className="shrink-0 text-state-fg-danger">{tr("toolFailed")}</span>}
    </button>
  );
}

/** Emphasised first segment of a provider error; a scheme or port never splits a URL. */
function SessionErrorMessage({ message, links }: { message: string; links?: boolean }) {
  const url = message.search(/https?:\/\//);
  const separator = message.slice(0, url === -1 ? undefined : url).indexOf(":");
  const title = separator === -1 ? undefined : message.slice(0, separator + 1);
  const detail = separator === -1 ? message : message.slice(separator + 1);
  return (
    <>
      {title && <strong className="font-[530]">{title}</strong>}
      {links ? <LinkedText text={detail} /> : detail}
    </>
  );
}

/**
 * Drives the quiet compaction divider's entrance: a new running compaction
 * waits out the grace before showing, and one that finishes inside it fades in
 * as Compacted only. The box never changes height, so the timeline holds still.
 */
function useCompactionEntrance(running: boolean, created?: string) {
  const [enter, setEnter] = useState<string | undefined>(undefined);
  const graceTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const age = created ? Date.now() - Date.parse(created) : Number.POSITIVE_INFINITY;
    let state = createCompactionEntranceState({
      ageMs: Number.isFinite(age) ? age : Number.POSITIVE_INFINITY,
      running,
    });
    setEnter(selectCompactionEnter(state.state));
    for (const effect of state.effects) {
      if (effect.type !== "schedule-grace") continue;
      graceTimer.current = window.setTimeout(() => {
        state = transitionCompactionEntrance(state.state, GRACE_ELAPSED_EVENT);
        setEnter(selectCompactionEnter(state.state));
      }, effect.delayMs);
    }
    return () => {
      if (graceTimer.current !== undefined) window.clearTimeout(graceTimer.current);
    };
    // The entrance is decided when the divider mounts; a later status change
    // keeps the styling so the light does not restart mid-animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);

  return enter;
}

/** Rich compaction checkpoint: state, summary and how much history it replaced. */
function CompactionMessage({ entry, working }: { entry: TimelineEntry; working?: boolean }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const compaction = entry.compaction ?? {};
  const summary = (compaction.summary ?? "").trim();
  const running = compaction.status === "running";
  const failed = compaction.status === "failed";
  const preview = summary.length > 240 ? `${summary.slice(0, 240)}…` : summary;
  const enter = useCompactionEntrance(running, entry.created);
  if (running && working) {
    return (
      <div
        data-component="session-compaction-message"
        data-quiet="true"
        data-status="running"
        data-enter={enter}
        className="my-1 flex w-full min-w-0 items-center gap-2 py-1 text-meta leading-4 text-text-faint"
      >
        <ActivityRing size={14} className="shrink-0 text-text-faint" />
        <TextShimmer text={tr("compactionRunning")} active />
      </div>
    );
  }
  // An automatic checkpoint is background housekeeping, so it reads as one
  // quiet line with a travelling highlight instead of a full divider.
  const quiet = !running && !failed && compaction.reason === "auto";
  if (quiet) {
    return (
      <div
        data-component="session-compaction-message"
        data-quiet="true"
        data-status={compaction.status ?? "completed"}
        data-enter={enter}
        className="my-1 flex w-full min-w-0 flex-col gap-2"
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="timeline-quiet-line flex h-6 min-w-0 items-center gap-2 text-start text-meta leading-4 text-text-faint hover:text-text-muted"
        >
          <span className="shrink-0">{tr("compactionTitle")}</span>
          {compaction.covered ? <span className="shrink-0">· {compaction.covered} messages</span> : null}
          {compaction.usage ? <span className="shrink-0">· {compaction.usage}</span> : null}
        </button>
        {open && summary ? (
          <div className="max-h-80 overflow-y-auto rounded-md bg-bg-layer-01 px-2 py-1.5 text-meta leading-4 text-text-muted shadow-[inset_0_0_0_0.5px_var(--border-muted)]">
            <Markdown text={summary} />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      data-component="session-compaction-message"
      data-status={compaction.status ?? "completed"}
      className="my-3 flex w-full min-w-0 flex-col gap-2"
    >
      <div className="flex h-8 items-center gap-3 text-text-faint">
        <span className="timeline-separator-line h-px min-w-0 flex-1" />
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 font-[440] tracking-[-0.04px]">
          {running ? (
            <ActivityRing size={14} className="text-text-faint" />
          ) : (
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${failed ? "bg-state-fg-danger" : "bg-state-fg-success"}`}
            />
          )}
          <span className="shrink-0">{running ? tr("compactionRunning") : failed ? tr("compactionFailed") : tr("compactionTitle")}</span>
          {!running && compaction.reason ? (
            <span className="shrink-0 capitalize text-text-faint">· {compaction.reason}</span>
          ) : null}
          {!running && compaction.covered ? (
            <span className="truncate text-text-faint">· {compaction.covered} messages</span>
          ) : null}
          {!running && compaction.usage ? (
            <span className="shrink-0 text-text-faint">· {compaction.usage}</span>
          ) : null}
        </span>
        <span className="timeline-separator-line timeline-separator-line-reverse h-px min-w-0 flex-1" />
      </div>
      {compaction.error ? (
        <div className="rounded-md bg-bg-layer-01 px-2 py-1.5 text-meta leading-4 text-state-fg-danger">
          <SessionErrorMessage message={compaction.error} links />
        </div>
      ) : summary ? (
        <div className="flex min-w-0 flex-col gap-1 rounded-md bg-bg-layer-01 px-2 py-1.5 shadow-[inset_0_0_0_0.5px_var(--border-muted)]">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex min-w-0 items-center gap-1.5 text-start text-meta leading-4 text-text-muted hover:text-text-base"
          >
            <ChevronDown className={`size-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
            <span className="truncate">{open ? tr("compactionHide") : preview}</span>
          </button>
          {open && (
            <div className="max-h-80 overflow-y-auto border-t-[0.5px] border-border-base pt-2">
              <Markdown text={summary} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Timeline divider for context compaction. */
function NoticeSeparator({
  notice,
  onOpenSession,
}: {
  notice: NonNullable<TimelineEntry["notice"]>;
  onOpenSession?: (sessionID: string) => void;
}) {
  const tr = useT();
  const text = noticeLabel(notice, tr);
  const value = notice.description;
  const link = notice.source === "subagent" && notice.id && onOpenSession ? notice.id : undefined;
  // The outcome colours the label and, for a failure, adds the warning glyph,
  // matching the reference notice row.
  const tone =
    notice.state === "error"
      ? "text-state-fg-danger"
      : notice.state === "cancelled"
        ? "text-state-fg-warning"
        : notice.state
          ? "text-state-fg-success"
          : undefined;
  return (
    <div
      data-slot="session-timeline-notice"
      data-outcome={notice.state}
      className="flex w-full min-w-0 items-center gap-1.5 py-1 text-body leading-5 tracking-[-0.04px] text-text-faint"
    >
      {notice.state === "error" && <TriangleAlert className="size-4 shrink-0 text-state-fg-danger" />}
      {notice.state === "cancelled" && <Ban className="size-4 shrink-0 text-state-fg-warning" />}
      {link ? (
        <>
          <button
            type="button"
            onClick={() => onOpenSession?.(link)}
            className={cn("min-w-0 truncate text-start font-[530] hover:text-text-base", tone)}
          >
            {text}
          </button>
          {value && (
            <span className="min-w-0 truncate" dir="auto">
              {`· ${value}`}
            </span>
          )}
        </>
      ) : (
        // Label and data share one line and one text node, so the row truncates
        // as a unit the way the reference notice does.
        <span className="min-w-0 truncate" dir="auto">
          <span className={cn("font-[530]", tone)}>{text}</span>
          {value ? ` · ${value}` : ""}
        </span>
      )}
    </div>
  );
}

function TimelineSeparator({ label, value, variant }: { label: string; value?: string; variant?: string }) {
  return (
    <div className="my-2 flex h-8 select-none items-center gap-3 text-text-faint">
      <span className="timeline-separator-line h-px min-w-0 flex-1" />
      <span className="flex min-w-0 items-center gap-1.5 text-body font-[440] tracking-[-0.04px]">
        <span className="shrink-0 truncate">{label}</span>
        {value && <span className="min-w-0 truncate text-text-faint" dir="ltr">{value}</span>}
        {variant && variant !== "default" && (
          <span className="flex shrink-0 items-center gap-1">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            <span className="capitalize">{variant}</span>
          </span>
        )}
      </span>
      <span className="timeline-separator-line timeline-separator-line-reverse h-px min-w-0 flex-1" />
    </div>
  );
}

/**
 * The divider an agent or model change draws. Both read as one separator, and
 * a model change carries the provider's own icon and its variant dot, matching
 * the reference timeline.
 */
function SwitchSeparator({
  value,
  modelName,
}: {
  value: MessageSwitch;
  modelName?: (provider: string, model: string) => string;
}) {
  const tr = useT();
  if (value.kind === "agent") {
    return <TimelineSeparator label={tr("agentSwitched", { agent: capitalize(value.agent ?? "") })} />;
  }
  const label = value.model
    ? modelName
      ? modelName(value.provider ?? "", value.model)
      : value.model
    : tr("modelSwitched");
  return <TimelineSeparator label={tr("modelSwitchedTo", { model: label })} />;
}

/** Live turn status under the last content, kept for as long as the turn runs. */
function RunningStatus({ status }: { status: TimelineStatus }) {
  const tr = useT();
  const label =
    status === "waitingApproval"
      ? tr("statusWaitingApproval")
      : status === "waitingAnswer"
        ? tr("statusWaitingAnswer")
        : status === "waitingShell"
          ? tr("statusWaitingShell")
          : tr("statusWorking");
  return (
    <div
      data-component="session-working"
      data-status={status}
      role="status"
      aria-label={label}
      className="mt-3 flex h-9 select-none items-center gap-2 pt-3 text-[13px] leading-4 font-[530] tracking-[-0.04px] text-text-faint"
    >
      <TextShimmer active text={label} />
    </div>
  );
}

function RunFooter({ status, ms }: { status: NonNullable<ChatState["lastRunStatus"]>; ms?: number }) {
  const label =
    status === "completed"
      ? "Completed"
      : status === "stopped"
        ? "Stopped"
        : status === "max-steps"
          ? "Step limit reached"
          : "Failed";
  return (
    <div className="mt-3 flex select-none items-center gap-2 text-caption text-text-faint">
      <span
        className={`size-1.5 rounded-full bg-current ${
          status === "completed"
            ? "text-state-fg-success"
            : status === "stopped"
              ? "text-text-faint"
              : status === "max-steps"
                ? "text-state-fg-warning"
                : "text-state-fg-danger"
        }`}
      />
      <span>{label}</span>
      {ms !== undefined && ms > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatDuration(ms)}</span>
        </>
      )}
    </div>
  );
}
