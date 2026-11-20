import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
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

  // Horizontal and mobile layouts use their own tab strip / drawer, so the
  // vertical rail is not part of the window at all in those modes.
  if (shell.mobile || shell.resolvedLayout === "horizontal") return null;

  return (
    <SidebarRail open={shell.sidebarOpen} {...tabStrip}>
      {shell.resolvedLayout === "vertical" &&
        shell.preferences.appearance.sidebarOrganize === "projects" && <Sidebar {...tree} />}
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
function SidebarRail({
  open,
  children,
  ...tabs
}: { open: boolean; children?: ReactNode } & TabStrip) {
  const width = tabs.width ?? 240;
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const flight = useRef<Flight | undefined>(undefined);
  const flightTarget = useRef(0);
  const openWidth = useRef(width);
  const paintedWidth = useRef(open ? width : 0);
  const paintedOnce = useRef(false);
  const [present, setPresent] = useState(open);

  const stopFlight = useCallback(() => {
    if (flight.current) window.cancelAnimationFrame(flight.current.frame);
    flight.current = undefined;
  }, []);

  useEffect(() => stopFlight, [stopFlight]);

  // Shows `target` at once: writes the real box size and lets the contents wrap
  // with the rail again. A closed landing also unmounts the rail's contents.
  const settle = useCallback(
    (target: number) => {
      stopFlight();
      const element = wrapper.current;
      if (element) {
        element.style.width = `${target}px`;
        element.style.overflow = "";
      }
      if (content.current) {
        content.current.style.width = "";
        content.current.style.opacity = "";
      }
      paintedWidth.current = target;
      if (target === 0) setPresent(false);
    },
    [stopFlight],
  );

  const fly = useCallback(
    (target: number) => {
      const element = wrapper.current;
      if (!element || prefersReducedMotion()) {
        settle(target);
        return;
      }
      const box = content.current;
      element.style.overflow = "hidden";
      // Start the first frame where the last one left off, so a reversed close
      // continues from the current width rather than snapping back.
      element.style.width = `${paintedWidth.current}px`;
      if (box) {
        box.style.width = `${openWidth.current}px`;
        box.style.opacity = `${panelContentOpacity(paintedWidth.current, openWidth.current)}`;
      }
      const state: Flight = {
        spring: panelSpring(paintedWidth.current, openWidth.current),
        frame: 0,
        last: performance.now(),
      };
      flight.current = state;
      const step = (time: number) => {
        if (flight.current !== state) return;
        const dt = Math.min(0.064, Math.max(1 / 240, (time - state.last) / 1000));
        state.last = time;
        const resting = stepPanelSpring(state.spring, flightTarget.current, dt);
        const value = Math.max(0, state.spring.value);
        element.style.width = `${value}px`;
        paintedWidth.current = value;
        if (box) box.style.opacity = `${panelContentOpacity(value, openWidth.current)}`;
        if (!resting) {
          state.frame = window.requestAnimationFrame(step);
          return;
        }
        settle(flightTarget.current);
      };
      state.frame = window.requestAnimationFrame(step);
    },
    [settle],
  );

  // A toggle flies the width; opening also brings the rail into the tree so its
  // close can travel. A rail first shown already open has no flight to make.
  useLayoutEffect(() => {
    if (!wrapper.current) return;
    const target = open ? width : 0;
    openWidth.current = width;
    flightTarget.current = target;
    if (open) setPresent(true);
    if (!paintedOnce.current) {
      paintedOnce.current = true;
      if (open) {
        settle(target);
        return;
      }
    }
    // A second toggle mid-flight retargets it: the spring keeps its velocity, so
    // a reversed close turns around smoothly instead of restarting.
    if (flight.current) return;
    if (Math.abs(paintedWidth.current - target) < 0.5) {
      settle(target);
      return;
    }
    fly(target);
    // Width rides on a flight only when the rail toggles; a resize at rest is
    // applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present, fly, settle]);

  // A width change at rest, from a drag, applies at once so the rail follows the
  // pointer instead of chasing it.
  useLayoutEffect(() => {
    if (!wrapper.current) return;
    const target = open ? width : 0;
    openWidth.current = width;
    flightTarget.current = target;
    if (flight.current) return;
    settle(target);
  }, [width, open, settle]);

  return (
    <div
      ref={wrapper}
      // Width is written frame by frame while the rail travels, so React leaves
      // it alone; the layout effects above seed it on mount and on resize.
      className="relative shrink-0"
      aria-hidden={!open ? true : undefined}
    >
      <div ref={content} className="h-full">
        {present && <SideTabs {...tabs}>{children}</SideTabs>}
      </div>
    </div>
  );
}
