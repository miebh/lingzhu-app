import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Copy that a reader sees has to come from the message catalog, so switching
 * the language cannot leave an English label behind. Example values and
 * identifiers stay verbatim, because translating them would break the input.
 */

const PACKAGES = join(import.meta.dirname, "../../../../packages");

/** Placeholders that are example values or code, not prose. */
const VERBATIM = new Set([
  "{}",
  "8192",
  "gpt-4.1",
  "https://api.openai.com/v1",
  "model-a, model-b",
  "index.html",
  "path/to/file",
  "OPENAI_API_KEY",
  "npm install",
]);

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sources(full));
      continue;
    }
    if (!/\.tsx$/.test(entry) || /\.test\./.test(entry)) continue;
    found.push(full);
  }
  return found;
}

describe("user-facing copy is localized", () => {
  test("no component hardcodes a label, title or placeholder", () => {
    const attribute = /\b(aria-label|title|placeholder)="([^"]{2,})"/g;
    const offenders: string[] = [];

    for (const file of sources(PACKAGES)) {
      const text = readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      attribute.lastIndex = 0;
      while ((match = attribute.exec(text))) {
        if (VERBATIM.has(match[2])) continue;
        offenders.push(`${relative(PACKAGES, file)}: ${match[1]}="${match[2]}"`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("no component hardcodes a line of visible text", () => {
    // A JSX text child sits alone on its line with no code punctuation.
    const bare = /^\s*([A-Z][A-Za-z0-9 ,.'’/&:+-]{2,60})\s*$/;
    const skip = new Set(["Promise", "Record", "Array", "String", "Number", "Boolean", "Object"]);
    const offenders: string[] = [];

    for (const file of sources(PACKAGES)) {
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line) || /[;=(){}\[\]<>]/.test(line)) return;
          const match = bare.exec(line);
          if (!match || !/\s/.test(match[1].trim()) || skip.has(match[1].trim())) return;
          offenders.push(`${relative(PACKAGES, file)}:${index + 1} ${match[1].trim()}`);
        });
    }

    expect(offenders).toEqual([]);
  });

  test("the document language follows the UI language", () => {
    const i18n = readFileSync(join(PACKAGES, "ui/src/i18n.ts"), "utf8");
    expect(i18n).toContain('document.documentElement.lang = next === "zh" ? "zh-CN" : "en"');
  });
});
