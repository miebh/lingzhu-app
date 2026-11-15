/**
 * Whole-block syntax highlighting for Markdown fenced code. The diff and
 * execute surfaces tokenize one line at a time because that is all a patch
 * row carries; a fenced block has its full text, so it goes through the
 * WebAssembly highlighter the diff renderer already ships.
 *
 * Colours come back as `var(--syntax-*)`, which is the same role set the
 * `.tok-*` classes consume, so both surfaces stay on one theme.
 */
import { codeToTokens, isSupportedLanguage } from "@pierre/highlights";
import type { SyntaxKind } from "./syntax";

export interface HighlightToken {
  text: string;
  kind?: SyntaxKind;
}

/** One entry per line with no classification, used while text still streams. */
export function plainLines(text: string): HighlightToken[][] {
  return text.split("\n").map((line) => (line ? [{ text: line }] : []));
}

const KINDS: SyntaxKind[] = [
  "comment",
  "string",
  "regexp",
  "keyword",
  "primitive",
  "operator",
  "variable",
  "property",
  "type",
  "constant",
  "punctuation",
];

const theme = {
  name: "Lingzhu",
  appearance: "dark" as const,
  cssVariables: { prefix: "--" },
  style: {
    "editor.background": "bg-base",
    "editor.foreground": "fg-base",
    syntax: {
      attribute: "syntax-property",
      boolean: "syntax-constant",
      comment: "syntax-comment",
      constant: "syntax-constant",
      constructor: "syntax-type",
      embedded: "fg-base",
      emphasis: "fg-base",
      enum: "syntax-type",
      foreground: "fg-base",
      function: "syntax-primitive",
      hint: "syntax-comment",
      keyword: "syntax-keyword",
      "keyword.operator": "syntax-operator",
      label: "syntax-constant",
      link_text: "syntax-keyword",
      link_uri: "syntax-keyword",
      namespace: "syntax-constant",
      number: "syntax-constant",
      operator: "syntax-operator",
      preproc: "syntax-keyword",
      property: "syntax-variable",
      punctuation: "syntax-punctuation",
      "punctuation.special": "syntax-keyword",
      selector: "syntax-keyword",
      "selector.class": "syntax-property",
      "selector.id": "syntax-primitive",
      "selector.pseudo": "syntax-operator",
      string: "syntax-string",
      "string.escape": "syntax-constant",
      "string.regex": "syntax-regexp",
      "string.special": "syntax-constant",
      tag: "syntax-keyword",
      "tag.component.jsx": "syntax-type",
      text: "fg-base",
      "text.literal": "syntax-string",
      title: "syntax-keyword",
      type: "syntax-type",
      variable: "syntax-variable",
      "variable.parameter": "fg-base",
      "variable.special": "syntax-constant",
      variant: "syntax-constant",
    },
  },
} as const;

/** Extensions and aliases the fenced block may carry, mapped to a language id. */
const ALIASES: Record<string, string> = {
  js: "js",
  javascript: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  ts: "ts",
  typescript: "ts",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  go: "go",
  golang: "go",
  py: "py",
  python: "py",
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  shell: "sh",
  sql: "sql",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  xml: "html",
  svg: "html",
  md: "md",
  markdown: "md",
  yml: "yaml",
  yaml: "yaml",
  rs: "rust",
  rust: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  "c++": "cpp",
  hpp: "cpp",
  toml: "toml",
  diff: "diff",
  patch: "diff",
};

function languageID(language: string | undefined) {
  if (!language) return undefined;
  const key = language.trim().toLowerCase();
  const mapped = ALIASES[key] ?? key;
  return isSupportedLanguage(mapped) ? mapped : undefined;
}

function kindOf(color: string | undefined): SyntaxKind | undefined {
  if (!color) return undefined;
  const match = /var\(--syntax-([a-z]+)\)/.exec(color);
  if (!match) return undefined;
  const name = match[1] as SyntaxKind;
  return KINDS.includes(name) ? name : undefined;
}

/**
 * Tokenizes a whole block. Returns one entry per line so the caller can keep
 * the block's own line structure; an unsupported language or a highlighter
 * failure falls back to plain text.
 */
export function highlightBlock(text: string, language?: string): HighlightToken[][] {
  const plain = text.split("\n").map((line) => (line ? [{ text: line }] : []));
  const id = languageID(language);
  if (!id || !text) return plain;

  try {
    const result = codeToTokens(text, { lang: id as never, theme: theme as never, defaultColor: false });
    const lines = result.tokens.map((line) =>
      line.map((token) => ({ text: token.content, kind: kindOf(token.color) })),
    );
    // A trailing newline yields a final empty line the caller already has.
    while (lines.length > plain.length) lines.pop();
    while (lines.length < plain.length) lines.push([]);
    return lines;
  } catch {
    return plain;
  }
}
