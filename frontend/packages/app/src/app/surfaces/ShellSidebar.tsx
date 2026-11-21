import { createEffect, createSignal, onCleanup, type ComponentProps, type JSX } from "solid-js";
import { SideTabs } from "../../components/shell/SideTabs";
import { Sidebar } from "../../components/workspace/Sidebar";
import {
  panelContentOpacity,
  panelSpring,
  prefersReducedMotion,
  stepPanelSpring,
  type PanelSpring,
} from "../../lib/panelMotion";
import { useProjectTreeProps } from "../useProjectTreeProps";
import { useTabStripProps } from "../useTabStripProps";
import { useShell } from "../ShellProvider";

interface Flight {
  spring: PanelSpring;
  frame: number;
  last: number;
}

type TabStrip = Omit<ComponentProps<typeof SideTabs>, "children">;

/** The vertical rail: session tabs plus the optional Projects tree. */
export function ShellSidebar() {
  const shell = useShell();
  const tabStrip = useTabStripProps();
  const tree = useProjectTreeProps();

  // Narrow screens use the drawer instead of the docked rail.
  if (shell.mobile) return null;

  return (
    <SidebarRail open={shell.sidebarOpen} strip={tabStrip}>
      {shell.preferences.appearance.sidebarOrganize === "projects" && <Sidebar {...tree} />}
    </SidebarRail>
  );
}

/**
 * Keeps the rail mounted while it is closed and flies its width along the same
 * critically damped spring as the side panel, so a second toggle mid-flight
 * turns around smoothly instead of restarting. The contents hold their open
 * width and only fade over the last of the travel, which stops the tab titles
 * from rewrapping on every frame.
 */
function SidebarRail(props: { open: boolean; strip: TabStrip; children?: JSX.Element }) {
  let wrapper: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  let flight: Flight | undefined;
  let flightTarget = 0;
  let openWidth = props.strip.width ?? 240;
  let paintedWidth = props.open ? openWidth : 0;
  let paintedOnce = false;
  const [present, setPresent] = createSignal(props.open);

  const stopFlight = () => {
    if (flight) window.cancelAnimationFrame(flight.frame);
    flight = undefined;
  };

  onCleanup(stopFlight);

  // Shows `target` at once: writes the real box size and lets the contents wrap
  // with the rail again. A closed landing also unmounts the rail's contents.
  const settle = (target: number) => {
    stopFlight();
    if (wrapper) {
      wrapper.style.width = `${target}px`;
      wrapper.style.overflow = "";
    }
    if (content) {
      content.style.width = "";
      content.style.opacity = "";
    }
    paintedWidth = target;
    if (target === 0) setPresent(false);
  };

  const fly = (target: number) => {
    const element = wrapper;
    if (!element || prefersReducedMotion()) {
      settle(target);
      return;
    }
    const box = content;
    element.style.overflow = "hidden";
    // Start the first frame where the last one left off, so a reversed close
    // continues from the current width rather than snapping back.
    element.style.width = `${paintedWidth}px`;
    if (box) {
      box.style.width = `${openWidth}px`;
      box.style.opacity = `${panelContentOpacity(paintedWidth, openWidth)}`;
    }
    const state: Flight = {
      spring: panelSpring(paintedWidth, openWidth),
      frame: 0,
      last: performance.now(),
    };
    flight = state;
    const step = (time: number) => {
      if (flight !== state) return;
      const dt = Math.min(0.064, Math.max(1 / 240, (time - state.last) / 1000));
      state.last = time;
      const resting = stepPanelSpring(state.spring, flightTarget, dt);
      const value = Math.max(0, state.spring.value);
      element.style.width = `${value}px`;
      paintedWidth = value;
      if (box) box.style.opacity = `${panelContentOpacity(value, openWidth)}`;
      if (!resting) {
        state.frame = window.requestAnimationFrame(step);
        return;
      }
      settle(flightTarget);
    };
    state.frame = window.requestAnimationFrame(step);
  };

  // A toggle flies the width; opening also brings the rail into the tree so its
  // close can travel. A rail first shown already open has no flight to make.
  createEffect(() => {
    const open = props.open;
    const width = props.strip.width ?? 240;
    if (!wrapper) return;
    const target = open ? width : 0;
    openWidth = width;
    flightTarget = target;
    if (open) setPresent(true);
    if (!paintedOnce) {
      paintedOnce = true;
      if (open) {
        settle(target);
        return;
      }
    }
    // A second toggle mid-flight retargets it: the spring keeps its velocity, so
    // a reversed close turns around smoothly instead of restarting.
    if (flight) return;
    if (Math.abs(paintedWidth - target) < 0.5) {
      settle(target);
      return;
    }
    fly(target);
  });

  // A width change at rest, from a drag, applies at once so the rail follows the
  // pointer instead of chasing it.
  createEffect(() => {
    const width = props.strip.width ?? 240;
    const open = props.open;
    if (!wrapper) return;
    const target = open ? width : 0;
    openWidth = width;
    flightTarget = target;
    if (flight) return;
    settle(target);
  });

  return (
    <div
      ref={(element) => (wrapper = element)}
      // Width is written frame by frame while the rail travels, so the layout
      // effects above seed it on mount and on resize.
      class="relative shrink-0"
      aria-hidden={!props.open ? true : undefined}
    >
      <div ref={(element) => (content = element)} class="h-full">
        {present() && (
          <SideTabs
            tabs={props.strip.tabs}
            activeKey={props.strip.activeKey}
            onSelect={props.strip.onSelect}
            onClose={props.strip.onClose}
            onCloseOthers={props.strip.onCloseOthers}
            onCloseAfter={props.strip.onCloseAfter}
            onDeleteTab={props.strip.onDeleteTab}
            onRename={props.strip.onRename}
            onReorder={props.strip.onReorder}
            onNew={props.strip.onNew}
            onSearch={props.strip.onSearch}
            onHome={props.strip.onHome}
            homeActive={props.strip.homeActive}
            highlightActive={props.strip.highlightActive}
            homeKeybind={props.strip.homeKeybind}
            newKeybind={props.strip.newKeybind}
            searchKeybind={props.strip.searchKeybind}
            closedTabs={props.strip.closedTabs}
            onReopenClosed={props.strip.onReopenClosed}
            width={props.strip.width}
            onWidthChange={props.strip.onWidthChange}
            topInset={props.strip.topInset}
          >
            {props.children}
          </SideTabs>
        )}
      </div>
    </div>
  );
}
