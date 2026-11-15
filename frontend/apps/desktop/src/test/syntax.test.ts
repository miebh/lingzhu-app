import { describe, expect, test } from "vitest";
import { languageOf, tokenize } from "@lingzhu/session-ui/syntax";

const plain = (line: string, language: string) =>
  tokenize(line, language)
    .map((token) => token.text)
    .join("");

describe("syntax tokenizer", () => {
  test("classifies JavaScript keywords, constants, strings and comments", () => {
    const tokens = tokenize('const answer = "yes"; // note', "js");
    expect(tokens.find((token) => token.text === "const")?.kind).toBe("keyword");
    expect(tokens.find((token) => token.text === '"yes"')?.kind).toBe("string");
    expect(tokens.find((token) => token.text === "// note")?.kind).toBe("comment");
    expect(plain('const answer = "yes"; // note', "js")).toBe('const answer = "yes"; // note');
  });

  test("classifies Go keywords, types and numbers", () => {
    const tokens = tokenize("func main() {", "go");
    expect(tokens.find((token) => token.text === "func")?.kind).toBe("keyword");
    expect(plain("func main() {", "go")).toBe("func main() {");
  });

  test("keeps markdown and unknown extensions plain", () => {
    expect(languageOf("AGENTS.md")).toBe("text");
    expect(tokenize("plain text", "text")).toEqual([{ text: "plain text" }]);
  });

  test("maps common extensions to a language", () => {
    expect(languageOf("src/app.tsx")).toBe("js");
    expect(languageOf("main.go")).toBe("go");
    expect(languageOf("tool.py")).toBe("py");
    expect(languageOf("run.sh")).toBe("sh");
    expect(languageOf("main.css")).toBe("css");
  });
});
