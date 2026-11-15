/** Closes a target-driven dialog by clearing its target when it reports closed. */
export function closeTarget<T>(set: (value: T | undefined) => void) {
  return (open: boolean) => {
    if (!open) set(undefined);
  };
}
