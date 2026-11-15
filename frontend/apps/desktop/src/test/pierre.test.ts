import { describe, expect, test } from "vitest";
import { parseFileDiff } from "@lingzhu/session-ui/pierre";

const patch = [
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,2 +1,3 @@",
  "-const value = 1;",
  "+const value = 2;",
  "+const extra = 3;",
  " export {};",
  "",
].join("\n");

describe("pierre diff metadata", () => {
  test("parses the matching file from a unified patch", () => {
    const file = parseFileDiff("src/app.ts", patch);
    expect(file?.name).toBe("b/src/app.ts");
    expect(file?.hunks?.length).toBe(1);
  });

  test("returns undefined for an empty patch", () => {
    expect(parseFileDiff("src/app.ts", "")).toBeUndefined();
  });
});
