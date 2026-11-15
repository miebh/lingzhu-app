import { describe, expect, test } from "vitest";
import { orderedVariants } from "@/lib/models";
import type { ModelSettings } from "@lingzhu/ui/types";

const variants = (ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, {}])) as ModelSettings["variants"];

describe("orderedVariants", () => {
  test("lists reasoning levels from off to max", () => {
    expect(orderedVariants(variants(["max", "low", "xhigh", "none", "high", "thinking", "medium"]))).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "thinking",
    ]);
  });

  test("keeps custom levels after the known ones", () => {
    expect(orderedVariants(variants(["zebra", "alpha", "low"]))).toEqual(["low", "alpha", "zebra"]);
  });
});
