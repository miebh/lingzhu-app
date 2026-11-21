import { createMemo, createSignal, type Accessor } from "solid-js";
import { shallowEqual } from "@lingzhu/ui/solid";

type PartialState<T> = Partial<T> | ((state: T) => Partial<T> | T);

export interface StoreApi<T> {
  getState: () => T;
  setState: (partial: PartialState<T>) => void;
  subscribe: (listener: (state: T, previous: T) => void) => () => void;
}

export type StoreHook<T> = <U>(selector: (state: T) => U) => Accessor<U>;

/**
 * A vanilla store with a Solid hook attached. `setState` merges a partial into
 * the current state, like the external store the app used before; returning the
 * current object from an updater is a no-op, so actions can keep early returns.
 *
 * The hook is the store itself, so callers keep `useStore(selector)` and now get
 * an accessor. A version signal makes every selector recompute on a store
 * change, and a selector that reads other accessors also follows those. Results
 * compare shallowly, so a selector that rebuilds an equivalent array or record
 * does not wake its consumer.
 */
export function createStore<T extends object>(
  init: (setState: StoreApi<T>["setState"], getState: () => T) => T,
): StoreApi<T> & StoreHook<T> {
  let state: T;
  const listeners = new Set<(state: T, previous: T) => void>();
  const [version, setVersion] = createSignal(0, { equals: false });

  const getState = () => state;

  const setState: StoreApi<T>["setState"] = (partial) => {
    const previous = state;
    const next =
      typeof partial === "function"
        ? (partial as (current: T) => Partial<T> | T)(previous)
        : partial;
    if (next === previous) return;
    state = Object.assign({}, previous, next);
    for (const listener of listeners) listener(state, previous);
    setVersion((value) => value + 1);
  };

  const subscribe = (listener: (state: T, previous: T) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  state = init(setState, getState);

  const useStore: StoreHook<T> = <U>(selector: (state: T) => U) =>
    createMemo(
      () => {
        version();
        return selector(getState());
      },
      undefined,
      { equals: shallowEqual },
    );

  return Object.assign(useStore, { getState, setState, subscribe });
}
