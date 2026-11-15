import { describe, expect, test } from "vitest";
import { renderMermaidSvg } from "@lingzhu/session-ui/mermaid";

describe("mermaid rendering", () => {
  test("ignores a fence that is not a diagram", async () => {
    expect(await renderMermaidSvg("const a = 1")).toBeUndefined();
  });

  test("renders a flowchart fence to svg", async () => {
    const svg = await renderMermaidSvg("flowchart LR\n  A[Start] --> B[Done]");
    expect(svg).toContain("<svg");
    expect(svg).toContain("pele-flowchart");
    expect(svg).toContain("Start");
    expect(svg).toContain("Done");
  });

  test("themes the diagram through role variables", async () => {
    const svg = await renderMermaidSvg("flowchart TD\n  A --> B");
    // Pele paints from CSS variables so light and dark stay on one theme.
    expect(svg).toContain("var(--pele-");
  });
});
