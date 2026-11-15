/** Splits plain text into runs, marking each http(s) URL with its link target. */
export function linkSegments(text: string): { text: string; href?: string }[] {
  const result: { text: string; href?: string }[] = [];
  let last = 0;

  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    const href = match[0].replace(/[),.;:!?\]]+$/, "");
    try {
      new URL(href);
    } catch {
      continue;
    }
    if (match.index > last) result.push({ text: text.slice(last, match.index) });
    result.push({ text: href, href });
    last = match.index + href.length;
  }

  if (last < text.length) result.push({ text: text.slice(last) });
  return result;
}
