/**
 * Errors arrive as strings from the Wails bindings, as Error objects from
 * local code, or as anything a rejected promise carries. Every surface needs
 * one readable line, so unwrap them in one place.
 */
export function messageOf(error: unknown): string {
  if (isCancellation(error)) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * A user-initiated cancel is not a failure. Both the local bindings and the
 * core report it as "context canceled", "wait cancelled", "cancelled ..." or
 * "interrupted"; those must never surface as errors or toasts.
 */
export function isCancellation(error: unknown): boolean {
  const text =
    typeof error === "string" ? error : error instanceof Error ? error.message : error == null ? "" : String(error);
  const value = text.trim().toLowerCase();
  if (!value) return false;
  return (
    value === "interrupted" ||
    value === "context canceled" ||
    value === "context cancelled" ||
    value === "wait cancelled" ||
    value === "wait canceled" ||
    value.startsWith("cancelled") ||
    value.startsWith("canceled") ||
    value.includes(" was cancelled") ||
    value.includes(" was canceled")
  );
}
