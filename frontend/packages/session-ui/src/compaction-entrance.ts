/** How long a new compaction waits before showing Compacting; CSS delays its fade by the same. */
export const COMPACTION_GRACE_MS = 400;

/** A compaction that finished at most this long ago when it mounts still fades in. */
export const COMPACTION_RECENT_DONE_MS = 1_000;

/**
 * How a quiet compaction divider enters.
 * - `grace`: new and running; CSS holds it hidden for the grace, and finishing
 *   inside it switches to `instant`.
 * - `revealed`: the grace passed while it ran. It keeps the grace styling so
 *   its animations do not restart, and a later finish rolls Compacting to
 *   Compacted in place.
 * - `instant`: it finished inside the grace, or had just finished when it
 *   mounted; it fades in as Compacted only.
 * - `settled`: it was already running or finished when history loaded.
 */
export type CompactionEntranceState =
  | { status: "grace" }
  | { status: "revealed" }
  | { status: "instant" }
  | { status: "settled" };

export type CompactionEntranceEvent =
  | { type: "running.changed"; running: boolean }
  | { type: "grace.elapsed" };

export type CompactionEntranceEffect =
  | { type: "schedule-grace"; delayMs: number }
  | { type: "cancel-grace" };

export type CompactionEntranceTransition = {
  state: CompactionEntranceState;
  effects: CompactionEntranceEffect[];
};

const GRACE: CompactionEntranceState = { status: "grace" };
const REVEALED: CompactionEntranceState = { status: "revealed" };
const INSTANT: CompactionEntranceState = { status: "instant" };
const SETTLED: CompactionEntranceState = { status: "settled" };

const NO_EFFECTS: CompactionEntranceEffect[] = [];
const SCHEDULE_GRACE: CompactionEntranceEffect[] = [{ type: "schedule-grace", delayMs: COMPACTION_GRACE_MS }];
const CANCEL_GRACE: CompactionEntranceEffect[] = [{ type: "cancel-grace" }];

export const GRACE_ELAPSED_EVENT: CompactionEntranceEvent = { type: "grace.elapsed" };

/** `ageMs` is how long ago the compaction started, when the divider mounts. */
export function createCompactionEntranceState(input: {
  ageMs: number;
  running: boolean;
}): CompactionEntranceTransition {
  if (input.running && input.ageMs < COMPACTION_GRACE_MS) return { state: GRACE, effects: SCHEDULE_GRACE };
  if (!input.running && input.ageMs < COMPACTION_RECENT_DONE_MS) return { state: INSTANT, effects: NO_EFFECTS };
  return { state: SETTLED, effects: NO_EFFECTS };
}

export function transitionCompactionEntrance(
  state: CompactionEntranceState,
  event: CompactionEntranceEvent,
): CompactionEntranceTransition {
  if (state.status !== "grace") return { state, effects: NO_EFFECTS };
  if (event.type === "grace.elapsed") return { state: REVEALED, effects: NO_EFFECTS };
  return event.running ? { state, effects: NO_EFFECTS } : { state: INSTANT, effects: CANCEL_GRACE };
}

/** The divider's `data-enter`: `revealed` keeps `grace` so its delayed animations do not restart. */
export function selectCompactionEnter(state: CompactionEntranceState) {
  if (state.status === "grace" || state.status === "revealed") return "grace";
  if (state.status === "instant") return "now";
  return undefined;
}
