import { expect, test } from "vitest";
import { createVirtualizedFileDiff, parseFileDiff } from "@lingzhu/session-ui/pierre";

test("the vendored pierre renderer mounts a highlighted diff", async () => {
  const patch = [
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,2 +1,3 @@",
    "-const x = 1;",
    "+const x = 2;",
    "+const y = 3;",
    " export {};",
    "",
  ].join("\n");
  const wrapper = document.createElement("div");
  document.body.append(wrapper);
  const fileDiff = parseFileDiff("a.ts", patch);
  expect(fileDiff).toBeTruthy();

  const { instance } = createVirtualizedFileDiff(wrapper, wrapper, false);
  instance.render({ fileDiff, containerWrapper: wrapper, lineAnnotations: [] });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const host = wrapper.querySelector("diffs-container") as HTMLElement | null;
  const html = host?.shadowRoot?.innerHTML ?? "";
  expect(host).toBeTruthy();
  expect(html).toContain("data-diff");
  expect(html).toContain("const");
  instance.cleanUp();
});
