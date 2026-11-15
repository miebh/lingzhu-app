import { describe, expect, test } from "vitest";
import { highlightBlock } from "@lingzhu/session-ui/highlight";

const plain = (lines: { text: string; kind?: string }[][]) => lines.map((line) => line.map((token) => token.text).join(""));

describe("markdown block highlighter", () => {
  test("keeps one entry per line and preserves the source text", () => {
    const source = "const answer = 42;\n\n// done";
    const lines = highlightBlock(source, "ts");
    expect(lines).toHaveLength(3);
    expect(plain(lines)).toEqual(["const answer = 42;", "", "// done"]);
  });

  test("maps token colours to the shared syntax roles", () => {
    const [line] = highlightBlock('const answer = "yes";', "ts");
    const kinds = new Map(line.map((token) => [token.text.trim(), token.kind]));
    expect(kinds.get("const")).toBe("keyword");
    expect(kinds.get('"yes"')).toBe("string");
    expect(kinds.get("=")).toBe("operator");
  });

  test("falls back to plain text for an unknown language", () => {
    const lines = highlightBlock("a => b", "not-a-language");
    expect(lines).toEqual([[{ text: "a => b" }]]);
  });

  test("accepts fenced aliases", () => {
    const [line] = highlightBlock("func main() {", "golang");
    expect(line.some((token) => token.kind === "keyword")).toBe(true);
  });
});
