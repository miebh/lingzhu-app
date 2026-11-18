import { describe, expect, test } from "vitest";
import {
  PANEL_CONTENT_FADE,
  panelContentOpacity,
  panelFlightSeconds,
  panelSpring,
  stepPanelSpring,
} from "@/lib/panelMotion";

describe("side panel motion", () => {
  test("a flight takes longer the further the panel travels", () => {
    expect(panelFlightSeconds(480)).toBeCloseTo(0.3);
    expect(panelFlightSeconds(120)).toBeCloseTo(0.15);
    // Narrow flights share the floor and wide ones the ceiling, so neither
    // crawls nor snaps.
    expect(panelFlightSeconds(40)).toBe(0.15);
    expect(panelFlightSeconds(2000)).toBe(0.3);
    expect(panelFlightSeconds(0)).toBe(0.3);
  });

  test("the spring reaches the open width and reports rest", () => {
    const spring = panelSpring(0, 480);
    let resting = false;
    for (let frame = 0; frame < 120 && !resting; frame += 1) resting = stepPanelSpring(spring, 480, 1 / 60);
    expect(resting).toBe(true);
    expect(spring.value).toBeCloseTo(480, 0);
  });

  test("a close lands on zero without travelling past it", () => {
    const spring = panelSpring(480, 480);
    let resting = false;
    for (let frame = 0; frame < 120 && !resting; frame += 1) resting = stepPanelSpring(spring, 0, 1 / 60);
    expect(resting).toBe(true);
    expect(spring.value).toBeGreaterThanOrEqual(0);
  });

  test("contents stay solid for most of the travel and fade at the closed end", () => {
    expect(panelContentOpacity(480, 480)).toBe(1);
    expect(panelContentOpacity(480 * PANEL_CONTENT_FADE, 480)).toBeCloseTo(1);
    expect(panelContentOpacity(24, 480)).toBeLessThan(1);
    expect(panelContentOpacity(0, 480)).toBe(0);
    // Nothing to scale against, so the contents stay as they are.
    expect(panelContentOpacity(0, 0)).toBe(1);
  });
});
