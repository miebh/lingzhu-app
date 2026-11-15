/** The latest Markdown heading in a reasoning stream, used as its live subtitle. */
export function reasoningHeading(text: string): string | undefined {
  const markdown = text.replace(/\r\n?/g, "\n");
  const html = lastHeading(markdown, /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (value) => value.replace(/<[^>]+>/g, " "));
  const atx = lastHeading(markdown, /^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/gm);
  const setext = lastHeading(markdown, /^([^\n]+)\n(?:=+|-+)\s*$/gm);
  const strong = lastHeading(markdown, /^\s*(?:\*\*((?:(?!\*\*).)+)\*\*|__((?:(?!__).)+)__)\s*$/gm);

  const latest = [html, atx, strong].reduce<HeadingMatch | undefined>(
    (best, current) => (!best || (current && current.index >= best.index) ? current : best),
    undefined,
  );
  return (latest ?? setext)?.value;
}

interface HeadingMatch {
  index: number;
  value: string;
}

function lastHeading(
  markdown: string,
  pattern: RegExp,
  transform?: (value: string) => string,
): HeadingMatch | undefined {
  let best: HeadingMatch | undefined;
  for (const match of markdown.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? "";
    const value = cleanHeading(transform ? transform(raw) : raw);
    if (value) best = { index: match.index, value };
  }
  return best;
}

function cleanHeading(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .trim();
}

/** Elapsed reasoning time, shown beside "Thought" like the reference. */
export function reasoningDuration(created?: string, endedAt?: string): string | undefined {
  if (!created || !endedAt) return undefined;
  const start = Date.parse(created);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  const total = Math.max(0, Math.round((end - start) / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}
