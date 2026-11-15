import { describe, expect, test } from "vitest";
import { paletteInitial } from "@lingzhu/app/lib/palette";

describe("initials", () => {
  test("keeps a whole code point for an astral character", () => {
    // Slicing the first UTF-16 unit would leave a lone surrogate, which renders
    // as a replacement glyph that reads like a stray "|".
    const initial = paletteInitial("🅰️ project");
    expect(initial).toBe("🅰");
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.codePointAt(0)).toBeGreaterThan(0xffff);
  });

  test("keeps a CJK initial intact", () => {
    expect(paletteInitial("工作目录")).toBe("工");
  });

  test("uppercases a latin initial and falls back for a blank name", () => {
    expect(paletteInitial("lingzhu")).toBe("L");
    expect(paletteInitial("   ")).toBe("?");
  });
});
