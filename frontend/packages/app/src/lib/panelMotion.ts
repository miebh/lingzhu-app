/**
 * The side panel's opening and closing feel: the real box width travels along a
 * critically damped spring, taking longer the further the panel has to move, so
 * a narrow panel doesn't crawl and a wide one doesn't snap. Contents keep their
 * open width for the flight and fade only across the last of the travel.
 */

const FLIGHT_REFERENCE_WIDTH = 480;
const FLIGHT_MIN_SECONDS = 0.15;
const FLIGHT_MAX_SECONDS = 0.3;

/** Share of the travel, at the closed end, over which the contents fade. */
export const PANEL_CONTENT_FADE = 0.15;

/** How long a flight across `width` pixels takes, scaled from a 480px panel. */
export function panelFlightSeconds(width: number): number {
  if (!(width > 0)) return FLIGHT_MAX_SECONDS;
  const seconds = FLIGHT_MAX_SECONDS * Math.sqrt(width / FLIGHT_REFERENCE_WIDTH);
  return Math.min(FLIGHT_MAX_SECONDS, Math.max(FLIGHT_MIN_SECONDS, seconds));
}

export interface PanelSpring {
  /** The current width in pixels. */
  value: number;
  /** Pixels per second. */
  velocity: number;
  /** Angular frequency, `2π / duration`, for a critically damped spring. */
  omega: number;
}

/** A spring that starts at rest at `value`, timed for a panel `width` wide. */
export function panelSpring(value: number, width: number): PanelSpring {
  return { value, velocity: 0, omega: (2 * Math.PI) / panelFlightSeconds(width) };
}

/**
 * Advances a spring toward `target` by `dt` seconds and reports whether it has
 * come to rest. Sub-steps keep a long frame stable, so a stall lands smoothly
 * instead of overshooting.
 */
export function stepPanelSpring(spring: PanelSpring, target: number, dt: number): boolean {
  const steps = Math.min(16, Math.max(1, Math.ceil(dt * 120)));
  const slice = dt / steps;
  for (let index = 0; index < steps; index += 1) {
    const force = -spring.omega * spring.omega * (spring.value - target) - 2 * spring.omega * spring.velocity;
    spring.velocity += force * slice;
    spring.value += spring.velocity * slice;
  }
  if (target <= 0 && spring.value < 0) {
    spring.value = 0;
    spring.velocity = 0;
  }
  return Math.abs(spring.value - target) < 0.5 && Math.abs(spring.velocity) < 8;
}

/** Contents are solid for most of the travel and arrive over the last 15%. */
export function panelContentOpacity(width: number, openWidth: number): number {
  if (!(openWidth > 0)) return 1;
  return Math.min(1, Math.max(0, width / (openWidth * PANEL_CONTENT_FADE)));
}

/** Whether the host asks for no motion; flights then settle in one frame. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
