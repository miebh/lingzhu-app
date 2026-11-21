import { Show, Suspense, createEffect, createSignal, lazy } from "solid-js";
import { useDialogStore } from "../store/dialogs";

// Every dialog group is a separate chunk: the first paint has no dialog open,
// and each group's components are heavy enough that parsing them on the way to
// the window costs more than loading them when one is first opened.
const ConfirmDialogs = lazy(async () => ({ default: (await import("./dialogs/ConfirmDialogs")).ConfirmDialogs }));
const PathDialogs = lazy(async () => ({ default: (await import("./dialogs/PathDialogs")).PathDialogs }));
const SessionDialogs = lazy(async () => ({ default: (await import("./dialogs/SessionDialogs")).SessionDialogs }));
const SpecialDialogs = lazy(async () => ({ default: (await import("./dialogs/SpecialDialogs")).SpecialDialogs }));

/**
 * Renders every dialog group; each slot reads its own payload from the store.
 * The groups mount the first time a dialog is opened and stay mounted after
 * that, so closing one keeps its exit animation and reopening costs nothing.
 */
export function DialogHost() {
  const anyOpen = useDialogStore((state) => Object.keys(state.entries).length > 0);
  const [mounted, setMounted] = createSignal(false);

  createEffect(() => {
    if (anyOpen()) setMounted(true);
  });

  return (
    <Show when={mounted()}>
      <Suspense fallback={null}>
        <ConfirmDialogs />
        <PathDialogs />
        <SessionDialogs />
        <SpecialDialogs />
      </Suspense>
    </Show>
  );
}
