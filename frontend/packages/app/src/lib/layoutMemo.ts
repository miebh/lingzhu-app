/**
 * Props equality for the layout components (sidebar and tab strips). These
 * are the largest trees outside the transcript, and they do not need to
 * re-render while only streaming text changes.
 *
 * Handlers are compared by presence: every handler calls a stable store
 * action or setter, and any state it closes over is also passed as a data
 * prop, so the surrounding memo has to refresh when that state changes.
 */
export function layoutPropsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (left === right) continue;
    if (typeof left === "function" && typeof right === "function") continue;
    if (key === "chats") {
      if (!chatMetaEqual(left, right)) return false;
      continue;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      if (!arrayEqual(left, right)) return false;
      continue;
    }
    if (left instanceof Set && right instanceof Set) {
      if (!setEqual(left, right)) return false;
      continue;
    }
    return false;
  }
  return true;
}

function arrayEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === right) continue;
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      recordEqual(left as Record<string, unknown>, right as Record<string, unknown>)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

function recordEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function setEqual(a: Set<unknown>, b: Set<unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function chatMetaEqual(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return left === right;
  const a = left as Record<string, ChatMeta>;
  const b = right as Record<string, ChatMeta>;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (!x || !y) return false;
    if (
      x.id !== y.id ||
      x.title !== y.title ||
      x.running !== y.running ||
      x.draft !== y.draft ||
      x.lastRunStatus !== y.lastRunStatus ||
      (x.pending?.length ?? 0) !== (y.pending?.length ?? 0) ||
      (x.questions?.length ?? 0) !== (y.questions?.length ?? 0)
    ) {
      return false;
    }
  }
  return true;
}

interface ChatMeta {
  id?: string;
  title?: string;
  running?: boolean;
  draft?: boolean;
  lastRunStatus?: string;
  pending?: unknown[];
  questions?: unknown[];
}
