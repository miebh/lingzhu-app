/** Returns the last path segment of an artifact file path. */
function artifactBaseName(path: string): string {
  const segment = path.split(/[\\/]/).pop() ?? "";
  return segment.trim();
}

/** Builds a filesystem-safe download name from a file path and fallback. */
export function artifactDownloadName(path: string, fallback: string): string {
  const raw = artifactBaseName(path) || fallback.trim() || "artifact";
  const safe = raw
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^\.+/, "")
    .trim();
  return safe || "artifact";
}
