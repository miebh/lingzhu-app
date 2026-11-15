/** One rendered line of a unified diff. */
export interface DiffLine {
  kind: "add" | "del" | "context" | "meta";
  old?: number;
  next?: number;
  text: string;
}

/** One split-pane row: the old side on the left, the new side on the right. */
export interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
}

/**
 * Pairs a unified patch into side-by-side rows: a hunk header spans both
 * sides, context repeats on both, and a run of deletions lines up with the
 * additions that replaced it.
 */
export function splitPatch(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.kind === "meta") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    if (line.kind === "context") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < lines.length && (lines[index].kind === "del" || lines[index].kind === "add")) {
      if (lines[index].kind === "del") removed.push(lines[index]);
      else added.push(lines[index]);
      index += 1;
    }
    const height = Math.max(removed.length, added.length);
    for (let row = 0; row < height; row += 1) {
      rows.push({ left: removed[row], right: added[row] });
    }
  }
  return rows;
}

/** A line-range review comment ready to send to the session composer. */
export interface ReviewComment {
  id: string;
  file: string;
  start: number;
  end: number;
  side: "old" | "new";
  text: string;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Converts one unified patch into fixed-width rows with line numbers. */
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let nextLine = 0;
  let inHunk = false;
  for (const raw of patch.replace(/\r\n/g, "\n").split("\n")) {
    const hunk = HUNK.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      nextLine = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    if (!inHunk) {
      if (raw === "" && lines.length === 0) continue;
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ kind: "add", next: nextLine, text: raw.slice(1) });
      nextLine += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      lines.push({ kind: "del", old: oldLine, text: raw.slice(1) });
      oldLine += 1;
      continue;
    }
    if (raw.startsWith("\\")) {
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    if (raw === "") {
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    if (raw.startsWith("diff --git") || raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ")) {
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    lines.push({ kind: "context", old: oldLine, next: nextLine, text: raw.slice(1) });
    oldLine += 1;
    nextLine += 1;
  }
  return lines;
}

/** Stable line number used when commenting on a rendered diff row. */
export function diffLineNumber(line: DiffLine): number | undefined {
  return line.kind === "del" ? line.old : (line.next ?? line.old);
}

/** Builds the prompt text sent from the review panel. */
export function formatReviewPrompt(comments: ReviewComment[]): string {
  if (comments.length === 0) return "";
  const notes = comments
    .slice()
    .sort((left, right) => left.file.localeCompare(right.file) || left.start - right.start)
    .map((comment) => {
      const range = comment.start === comment.end ? `L${comment.start}` : `L${comment.start}-${comment.end}`;
      return `- \`${comment.file}\` ${range} (${comment.side}): ${comment.text.trim()}`;
    });
  return `Please address these review notes:\n\n${notes.join("\n")}`;
}

/** Appends a review note; notes are kept in the order they were written. */
export function addReviewComment(comments: ReviewComment[], comment: ReviewComment): ReviewComment[] {
  return [...comments, comment];
}

export function removeReviewComment(comments: ReviewComment[], id: string): ReviewComment[] {
  return comments.filter((comment) => comment.id !== id);
}

