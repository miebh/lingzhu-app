/**
 * Errors arrive as strings from the Wails bindings, as Error objects from
 * local code, or as anything a rejected promise carries. Every surface needs
 * one readable line, so unwrap them in one place.
 */
export function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
