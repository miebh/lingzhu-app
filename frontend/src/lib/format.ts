/** Compact token counts: 980, 12.4k, 1.2M. */
export function formatTokens(value: number): string {
  if (!value) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/** Duration for a settled or running turn: 8.4s, 2m 42s. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${(Math.round(seconds * 10) / 10).toFixed(1)}s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

/** Cache-hit share of the prompt side; null when no prompt tokens were billed. */
export function formatCacheHit(usage: { input: number; cacheRead: number; cacheWrite: number }): string | null {
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
  if (prompt <= 0) return null;
  const percent = (usage.cacheRead / prompt) * 100;
  return percent >= 99.95 ? "100" : percent.toFixed(percent >= 99 ? 1 : 0);
}

/** Context occupancy percentage, clamped for the compact meter. */
export function contextPercent(tokens: number, window: number): number {
  if (window <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((tokens / window) * 100)));
}
