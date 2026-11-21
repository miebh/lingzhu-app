import { Show, Suspense, createEffect, createSignal, lazy, type JSX } from "solid-js";
import { SessionPanelToggle } from "../../components/session/SessionHeader";
import { useActiveChatField, useAtHome } from "../hooks";
import { useShell } from "../ShellProvider";

const SessionPanelPane = lazy(async () => ({
  default: (await import("../features/session/SessionPanelPane")).SessionPanelPane,
}));

/**
 * The main pane frame: the raised content card plus the review panel beside it.
 * Route content fills the card; the frame itself stays mounted across routes so
 * the sidebar, panel width and card edge do not flicker.
 */
export function ShellMain(props: { children?: JSX.Element }) {
  const shell = useShell();
  const view = shell.view;
  const atHome = useAtHome();
  const activeId = useActiveChatField((chat) => chat.id, undefined);
  // The panel mounts, closed, as soon as a session is on screen. Its chunk and
  // first render are then already paid for when the toggle is first used, so
  // the first open is a width flight rather than an import followed by a snap.
  const [panelMounted, setPanelMounted] = createSignal(shell.panel.panelOpen);
  createEffect(() => {
    if (shell.panel.panelOpen || (activeId() && !atHome() && !view.homeOpen)) setPanelMounted(true);
  });

  const showToggle = () => view.tab === "chat" && !view.homeOpen && Boolean(activeId()) && !atHome();

  return (
    <div class="relative flex min-w-0 flex-1 flex-col bg-bg-deep">
      <div class="relative flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
        <div data-panel-row class="relative flex min-h-0 flex-1 gap-2">
          {/* The review toggle floats above the row, so it stays put while the
              panel opens and closes under it. It must outrank the transcript's
              sticky header, which is opaque and shares the row's top edge. */}
          <Show when={showToggle()}>
            <div
              class="pointer-events-none absolute end-0 top-0 z-40 flex h-12 items-center"
              style={{ "padding-inline-end": "10px" }}
            >
              <SessionPanelToggle
                open={shell.panel.panelOpen}
                onToggle={() => shell.panel.setPanelOpen((value) => !value)}
                keybind={shell.keybinds["panel.review"]}
                class="pointer-events-auto"
              />
            </div>
          </Show>
          <div class="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-bg-base elevation-raised">
            {props.children}
          </div>
          <Suspense fallback={null}>{panelMounted() && <SessionPanelPane />}</Suspense>
        </div>
      </div>
    </div>
  );
}
