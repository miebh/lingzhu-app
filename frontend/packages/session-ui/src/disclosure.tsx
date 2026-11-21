import { createContext, createEffect, createSignal, onCleanup, useContext, type Accessor, type JSX } from "solid-js";

const ToolScopeContext = createContext<() => string>(() => "");

/** Keeps disclosure slices inside one session; tool IDs repeat across sessions. */
export function ToolScopeProvider(props: { scope: string; children?: JSX.Element }) {
  // The value is an accessor so a session switch reaches mounted rows without
  // remounting them (and the transcript's scrollport) under the virtualizer.
  return <ToolScopeContext.Provider value={() => props.scope}>{props.children}</ToolScopeContext.Provider>;
}

// Expanded state survives virtualization and transcript re-renders, like the
// desktop disclosure store. Every row keys its own slice.
const disclosures = new Map<string, boolean>();
// Listeners are scoped to their slice: toggling one card must not wake every
// mounted tool row, and a long transcript mounts many of them.
const disclosureListeners = new Map<string, Set<() => void>>();

function disclosureValue(keys: readonly string[], fallback: boolean) {
  for (const key of keys) {
    const value = disclosures.get(key);
    if (value !== undefined) return value;
  }
  return fallback;
}

/**
 * Open state for one disclosure. A row may pass several keys for the same
 * block: the first is the durable identity and later ones are aliases that
 * cover a rebuilt key. Reading prefers the first key that has a stored value,
 * and writing records the choice under every key, so an expanded block stays
 * expanded when a live transcript row is replaced by its persisted copy.
 */
export function useDisclosure(
  key: string | readonly string[],
  fallback = false,
): readonly [Accessor<boolean>, (next: boolean) => void] {
  const scope = useContext(ToolScopeContext);
  const keys = () =>
    (typeof key === "string" ? [key] : key).map((item) => (scope() ? `${scope()}:${item}` : item));
  const [open, setOpenState] = createSignal(disclosureValue(keys(), fallback));

  // A session switch changes the scope, so the subscription follows it instead
  // of keeping the keys of the transcript that mounted the row first.
  createEffect(() => {
    const scoped = keys();
    const update = () => setOpenState(disclosureValue(scoped, fallback));
    const listeners = scoped.map((item) => {
      const set = disclosureListeners.get(item) ?? new Set<() => void>();
      set.add(update);
      disclosureListeners.set(item, set);
      return [item, set] as const;
    });
    // A key can join a block after the user already opened it, such as the
    // first tool that arrives after a thought. Carry the stored choice onto the
    // new alias so the next render still finds it.
    if (scoped.some((item) => disclosures.get(item) !== undefined)) {
      const stored = disclosureValue(scoped, fallback);
      for (const item of scoped) {
        if (disclosures.get(item) === undefined) disclosures.set(item, stored);
      }
    }
    update();
    onCleanup(() => {
      for (const [item, set] of listeners) {
        set.delete(update);
        if (set.size === 0) disclosureListeners.delete(item);
      }
    });
  });

  const setOpen = (next: boolean) => {
    const scoped = keys();
    for (const item of scoped) disclosures.set(item, next);
    for (const item of scoped) disclosureListeners.get(item)?.forEach((listener) => listener());
  };

  return [open, setOpen] as const;
}

export interface DisclosureInput {
  stored: boolean;
  open?: boolean;
  forceOpen?: boolean;
  hasContent?: boolean;
  hasChildren: boolean;
  locked?: boolean;
  pending?: boolean;
  allowOpenWhilePending?: boolean;
}

export interface DisclosureView {
  open: boolean;
  expandable: boolean;
  canToggle: boolean;
}

/**
 * Resolves the visible disclosure state from the stored choice and the row's
 * props. Keeping the precedence here makes every tool row follow the same
 * rules: forceOpen wins, a locked row has no body, and a pending row stays
 * collapsed unless it explicitly allows reading while it runs.
 */
export function disclosureView(input: DisclosureInput): DisclosureView {
  const expandable = input.hasContent ?? input.hasChildren;
  const open = Boolean(input.forceOpen || input.open || input.stored);
  const canToggle = expandable && !input.locked && (!input.pending || Boolean(input.allowOpenWhilePending));
  return { open, expandable, canToggle };
}
