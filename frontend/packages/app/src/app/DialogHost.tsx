import { Suspense, lazy, useEffect, useState } from "react";
import { useDialogStore } from "../store/dialogs";

// Every dialog group is a separate chunk: the first paint has no dialog open,
// and each group's components are heavy enough that parsing them on the way to
// the window costs more than loading them when one is first opened.
const ConfirmDialogs = lazy(() => import("./dialogs/ConfirmDialogs").then((m) => ({ default: m.ConfirmDialogs })));
const PathDialogs = lazy(() => import("./dialogs/PathDialogs").then((m) => ({ default: m.PathDialogs })));
const SessionDialogs = lazy(() => import("./dialogs/SessionDialogs").then((m) => ({ default: m.SessionDialogs })));
const SpecialDialogs = lazy(() => import("./dialogs/SpecialDialogs").then((m) => ({ default: m.SpecialDialogs })));

/**
 * Renders every dialog group; each slot reads its own payload from the store.
 * The groups mount the first time a dialog is opened and stay mounted after
 * that, so closing one keeps its exit animation and reopening costs nothing.
 */
export function DialogHost() {
  const anyOpen = useDialogStore((state) => Object.keys(state.entries).length > 0);
  const [mounted, setMounted] = useState(anyOpen);
  useEffect(() => {
    if (anyOpen) setMounted(true);
  }, [anyOpen]);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ConfirmDialogs />
      <PathDialogs />
      <SessionDialogs />
      <SpecialDialogs />
    </Suspense>
  );
}
