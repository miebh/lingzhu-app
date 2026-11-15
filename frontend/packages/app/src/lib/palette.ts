const PALETTE_AVATAR_VARIANTS = [
  "orange",
  "yellow",
  "cyan",
  "green",
  "red",
  "pink",
  "blue",
  "purple",
  "gray",
] as const;

export type PaletteAvatarVariant = (typeof PALETTE_AVATAR_VARIANTS)[number];

/** Stable project identity color for the palette avatar. */
export function paletteVariant(seed: string): PaletteAvatarVariant {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return PALETTE_AVATAR_VARIANTS[hash % PALETTE_AVATAR_VARIANTS.length]!;
}

/** Splits a palette file path into its muted directory and strong filename. */
export function splitPalettePath(path: string): { directory: string; filename: string } {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) return { directory: "", filename: normalized };
  return { directory: `${normalized.slice(0, slash)}/`, filename: normalized.slice(slash + 1) };
}

/** One-character avatar fallback for a project name. */
export function paletteInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "?";
  // The first code point, so an emoji or other astral character is not cut in
  // half into a replacement glyph.
  return (Array.from(trimmed)[0] ?? "?").toUpperCase();
}

/** Clamps a palette selection to the current result list. */
export function clampPaletteIndex(selected: number, length: number): number {
  return length === 0 ? -1 : Math.min(selected, length - 1);
}

/** Wraps arrow-key movement over palette results. */
export function movePaletteSelection(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  if (current < 0) return 0;
  return (current + delta + length) % length;
}

/** Groups already-filtered commands by their first-seen group. */
export function groupPalette<T extends { group: string }>(commands: T[]): { group: string; items: T[] }[] {
  const groups: { group: string; items: T[] }[] = [];
  for (const command of commands) {
    const existing = groups.find((entry) => entry.group === command.group);
    if (existing) existing.items.push(command);
    else groups.push({ group: command.group, items: [command] });
  }
  return groups;
}

export interface PaletteCommand {
  id: string;
  title: string;
  group: string;
  hint?: string;
  description?: string;
  keybind?: string;
  keywords?: string[];
  /** Shown before anything is typed, like the desktop palette's preferred commands. */
  featured?: boolean;
  /** Presentation kind; commands without a kind render as plain command rows. */
  kind?: "command" | "session" | "file" | "setting";
  path?: string;
  project?: string;
  variant?: PaletteAvatarVariant;
  meta?: string;
  status?: "running" | "unread";
  run: () => void;
}

/** Fields used to match a palette entry against typed text. */
export type PaletteMatchable = Pick<PaletteCommand, "title" | "group" | "hint" | "description" | "keywords">;

/**
 * Filters commands by every space-separated token and ranks title matches
 * above keyword matches. Equal scores keep the caller's ordering so stable
 * groups never shuffle between keystrokes.
 */
export function filterPalette<T extends PaletteMatchable>(commands: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  const tokens = needle.split(/\s+/);
  const ranked: { command: T; score: number; index: number }[] = [];

  commands.forEach((command, index) => {
    const title = command.title.toLowerCase();
    const group = command.group.toLowerCase();
    const hint = [command.hint, command.description].filter(Boolean).join(" ").toLowerCase();
    const keywords = (command.keywords ?? []).map((word) => word.toLowerCase()).join(" ");
    const haystack = `${title} ${group} ${hint} ${keywords}`;
    if (!tokens.every((token) => haystack.includes(token))) return;

    let score = 0;
    if (title.startsWith(needle)) score += 30;
    else if (title.includes(needle)) score += 20;
    for (const token of tokens) {
      if (title.startsWith(token)) score += 6;
      else if (title.includes(token)) score += 3;
      else if (keywords.includes(token)) score += 1;
    }
    ranked.push({ command, score, index });
  });

  ranked.sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked.map((entry) => entry.command);
}
