import { createSignal } from "solid-js";

/**
 * One-shot launch restore. `startApp` arms it; the Home route consumes it. The
 * signal lets Home react when the app starts after the first paint.
 */
const [armed, setArmed] = createSignal(false);
let completed = false;

export function armStartupRestore(): void {
  completed = false;
  setArmed(true);
}

export function startupRestoreArmed(): boolean {
  return armed();
}

export function finishStartupRestore(): void {
  completed = true;
  setArmed(false);
}

/** Kept for diagnostics and tests; a finished restore must not run twice. */
export function startupRestoreCompleted(): boolean {
  return completed;
}
