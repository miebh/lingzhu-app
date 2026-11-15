import { describe, expect, test } from "vitest";
import {
  CHAT_PANEL_WIDTH_MIN,
  PANEL_ROW_GAP,
  PANEL_ROW_WIDTH_MIN,
  SIDE_PANEL_WIDTH_DEFAULT,
  SIDE_PANEL_WIDTH_MAX,
  SIDE_PANEL_WIDTH_MIN,
  clampSidePanelWidth,
  overlaySidePanelWidth,
  panelRowHoldsBoth,
  readSidePanelWidth,
  sidePanelWidthMax,
} from "@/lib/panelWidth";

describe("panel row geometry", () => {
  test("the transcript minimum plus the side panel floor is the row floor", () => {
    expect(PANEL_ROW_WIDTH_MIN).toBe(CHAT_PANEL_WIDTH_MIN + PANEL_ROW_GAP + SIDE_PANEL_WIDTH_MIN);
  });

  test("the side panel gives way before the transcript goes under its minimum", () => {
    // An 800px row still holds both: the panel caps at 392 so the chat keeps
    // 400 instead of the panel holding its old 480.
    expect(sidePanelWidthMax(800)).toBe(800 - PANEL_ROW_GAP - CHAT_PANEL_WIDTH_MIN);
    expect(clampSidePanelWidth(SIDE_PANEL_WIDTH_DEFAULT, 800)).toBe(392);
    expect(800 - PANEL_ROW_GAP - clampSidePanelWidth(SIDE_PANEL_WIDTH_DEFAULT, 800)).toBe(CHAT_PANEL_WIDTH_MIN);
    // Narrower than the floor, the cap stops at the panel's own minimum and the
    // panel floats instead of squeezing the transcript.
    expect(sidePanelWidthMax(636)).toBe(SIDE_PANEL_WIDTH_MIN);
    expect(panelRowHoldsBoth(636)).toBe(false);
  });

  test("an unknown row width leaves the stored width alone", () => {
    expect(clampSidePanelWidth(520)).toBe(520);
    expect(sidePanelWidthMax()).toBe(SIDE_PANEL_WIDTH_MAX);
  });

  test("a width beyond the hard range still clamps", () => {
    expect(clampSidePanelWidth(40, 1600)).toBe(SIDE_PANEL_WIDTH_MIN);
    expect(clampSidePanelWidth(1200, 1600)).toBe(SIDE_PANEL_WIDTH_MAX);
  });

  test("a row too narrow for both panels floats the panel instead", () => {
    expect(panelRowHoldsBoth(0)).toBe(true);
    expect(panelRowHoldsBoth(PANEL_ROW_WIDTH_MIN)).toBe(true);
    expect(panelRowHoldsBoth(PANEL_ROW_WIDTH_MIN - 1)).toBe(false);
  });

  test("a floating panel stays inside its row", () => {
    expect(overlaySidePanelWidth(SIDE_PANEL_WIDTH_DEFAULT, 700)).toBe(480);
    expect(overlaySidePanelWidth(SIDE_PANEL_WIDTH_DEFAULT, 360)).toBe(360 - PANEL_ROW_GAP * 2);
    expect(overlaySidePanelWidth(SIDE_PANEL_WIDTH_DEFAULT, 120)).toBe(104);
  });

  test("a stored width round-trips, and a bad one falls back to the default", () => {
    expect(readSidePanelWidth("560")).toBe(560);
    expect(readSidePanelWidth(null)).toBe(SIDE_PANEL_WIDTH_DEFAULT);
    expect(readSidePanelWidth("nope")).toBe(SIDE_PANEL_WIDTH_DEFAULT);
    expect(readSidePanelWidth("-20")).toBe(SIDE_PANEL_WIDTH_DEFAULT);
  });
});
