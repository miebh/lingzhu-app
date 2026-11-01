import { useRef } from "react";

/**
 * Hands the newest value to async callbacks. React state captured in a
 * callback goes stale the moment it is created; a ref always reads current.
 */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
