import { render } from "./solid-testing";
import { AppRoot } from "@/app/routes";

/**
 * Mounts the real route tree at `href`. Tests set their stores first, then pick
 * the URL that matches the surface they exercise; the router projects it onto
 * the same view flags production uses.
 */
export function renderApp(href = "/") {
  window.history.replaceState(null, "", href);
  return render(() => <AppRoot />);
}
