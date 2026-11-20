import { describe, expect, test } from "vitest";
import { disclosureView } from "./disclosure";

const base = { stored: false, hasChildren: true };

describe("disclosureView", () => {
  test("a closed row with a body expands from its stored choice", () => {
    expect(disclosureView(base)).toEqual({ open: false, expandable: true, canToggle: true });
    expect(disclosureView({ ...base, stored: true }).open).toBe(true);
  });

  test("forceOpen and an explicit open both win over the stored choice", () => {
    expect(disclosureView({ ...base, forceOpen: true }).open).toBe(true);
    expect(disclosureView({ ...base, open: true }).open).toBe(true);
    expect(disclosureView({ ...base, forceOpen: false, open: false, stored: true }).open).toBe(true);
  });

  test("hasContent declares a body without mounting children", () => {
    expect(disclosureView({ ...base, hasChildren: false, hasContent: true }).expandable).toBe(true);
    expect(disclosureView({ ...base, hasChildren: false }).canToggle).toBe(false);
  });

  test("locked rows show their body but never toggle", () => {
    expect(disclosureView({ ...base, locked: true, open: true })).toEqual({
      open: true,
      expandable: true,
      canToggle: false,
    });
  });

  test("pending rows stay collapsed unless reading while running is allowed", () => {
    expect(disclosureView({ ...base, pending: true }).canToggle).toBe(false);
    expect(disclosureView({ ...base, pending: true, allowOpenWhilePending: true }).canToggle).toBe(true);
  });
});
