import { createSignal, untrack, type Accessor, type Setter } from "solid-js";

/**
 * Compares two selector results. Store hooks re-run a selector on every store
 * change, so arrays and records that carry the same values must not wake their
 * consumers; this is the Solid replacement for `useShallow`.
 */
export function shallowEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightKeys = Object.keys(right as Record<string, unknown>);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) return false;
  }
  return true;
}

/**
 * A functional update for a signal. `createSignal` setters treat a function as
 * a value, so the previous state has to be read here instead.
 */
export function update<T>(setter: Setter<T>, current: Accessor<T>, next: (value: T) => T): void {
  setter(() => next(current()));
}

/** A reducer with the `useReducer` shape, built on a signal. */
export function createReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S | (() => S),
): [Accessor<S>, (action: A) => void] {
  const start = typeof initial === "function" ? (initial as () => S)() : initial;
  const [state, setState] = createSignal(start as Exclude<S, Function>, { equals: false }) as unknown as [
    Accessor<S>,
    (value: S | ((previous: S) => S)) => S,
  ];
  return [state, (action: A) => untrack(() => setState(reducer(state(), action)))];
}
