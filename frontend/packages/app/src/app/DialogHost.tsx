import { ConfirmDialogs } from "./dialogs/ConfirmDialogs";
import { PathDialogs } from "./dialogs/PathDialogs";
import { SessionDialogs } from "./dialogs/SessionDialogs";
import { SpecialDialogs } from "./dialogs/SpecialDialogs";

/** Renders every dialog group; each slot reads its own payload from the store. */
export function DialogHost() {
  return (
    <>
      <ConfirmDialogs />
      <PathDialogs />
      <SessionDialogs />
      <SpecialDialogs />
    </>
  );
}
