/**
 * One navigation entry point for code outside the router tree (stores, bridge
 * modules). The router installs its `navigate` when the app mounts; the current
 * href is tracked here too, so callers can skip a navigation that is already on
 * screen. Without a router (component tests that render a surface directly) the
 * call is a no-op and the caller's local state remains the source of truth.
 */

export interface NavigateOptions {
  replace?: boolean;
}

type Navigator = (href: string, options?: NavigateOptions) => void;

let navigator: Navigator | undefined;
let href = "/";

export function installNavigator(next: Navigator): void {
  navigator = next;
}

export function uninstallNavigator(next: Navigator): void {
  if (navigator === next) navigator = undefined;
}

export function navigateTo(next: string, options?: NavigateOptions): void {
  href = next;
  navigator?.(next, options);
}

/** Records the href the router is currently showing. */
export function setCurrentHref(next: string): void {
  href = next;
}

export function currentHref(): string {
  return href;
}
