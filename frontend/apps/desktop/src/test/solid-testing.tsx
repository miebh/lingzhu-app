import { createMemo, createSignal, type Accessor, type JSX } from "solid-js";
import {
  cleanup,
  fireEvent,
  render as solidRender,
  screen,
  waitFor,
  within,
} from "@solidjs/testing-library";
import { afterEach } from "vitest";

// Cleanup is registered where Solid is first imported, so the global setup file
// does not pull in a second copy of Solid for every test file.
afterEach(cleanup);

type Ui = JSX.Element | (() => JSX.Element);

function factoryOf(ui: Ui): () => JSX.Element {
  return typeof ui === "function" ? (ui as () => JSX.Element) : () => ui;
}

/**
 * Solid's render takes a factory, while the existing suites pass a JSX element.
 * Both are accepted; `rerender` swaps the factory and the fragment re-inserts
 * the new tree because the expression stays inside a reactive computation.
 */
export function render(ui: Ui, options?: Parameters<typeof solidRender>[1]) {
  let update: (next: Ui) => void = () => {};
  const result = solidRender(() => {
    const [current, setCurrent] = createSignal<() => JSX.Element>(factoryOf(ui));
    update = (next) => setCurrent(() => factoryOf(next));
    return <>{current()()}</>;
  }, options);
  return Object.assign(result, {
    rerender: (next: Ui) => update(next),
  });
}

/**
 * A hook harness with the `result.current` shape used by the suites. The hook
 * runs inside a memo, so a props change re-runs it and disposes its previous
 * effects.
 */
export function renderHook<Result, Props = undefined>(
  hook: (props: Props) => Result,
  options?: { initialProps?: Props },
) {
  let updateProps: (next: Props) => void = () => {};
  let latest: Accessor<Result> | undefined;
  const rendered = solidRender(() => {
    const [props, setProps] = createSignal<Props>(options?.initialProps as Props);
    updateProps = (next) => setProps(() => next);
    latest = createMemo(() => hook(props()));
    return null;
  });
  return {
    result: {
      get current(): Result {
        return latest!();
      },
    },
    rerender: (props?: Props) => updateProps(props as Props),
    unmount: rendered.unmount,
    cleanup: rendered.unmount,
  };
}

/** Solid updates synchronously, so an action only has to run. */
export async function act(callback: () => void | Promise<void>) {
  await callback();
}

export { cleanup, fireEvent, screen, waitFor, within };
