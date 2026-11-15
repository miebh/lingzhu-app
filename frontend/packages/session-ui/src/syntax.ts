/**
 * Lightweight syntax tokenizer for diff and code surfaces. It follows the
 * Syntax token groups so colours come from the same semantic slots,
 * without pulling a full TextMate grammar into the bundle.
 */
export type SyntaxToken = { text: string; kind?: SyntaxKind };

export type SyntaxKind =
  | "comment"
  | "string"
  | "regexp"
  | "keyword"
  | "primitive"
  | "operator"
  | "variable"
  | "property"
  | "type"
  | "constant"
  | "punctuation";

const KEYWORDS: Record<string, string[]> = {
  js: [
    "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "enum", "export", "extends", "finally", "for",
    "from", "function", "get", "if", "implements", "import", "in", "instanceof", "interface", "let",
    "new", "of", "package", "private", "protected", "public", "readonly", "return", "satisfies",
    "set", "static", "super", "switch", "this", "throw", "try", "type", "typeof", "var", "void",
    "while", "with", "yield",
  ],
  go: [
    "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for",
    "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return",
    "select", "struct", "switch", "type", "var",
  ],
  py: [
    "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
    "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
    "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
  ],
  sh: [
    "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "select",
    "then", "until", "while",
  ],
  sql: [
    "add", "all", "alter", "and", "as", "asc", "by", "case", "create", "delete", "desc", "distinct",
    "drop", "else", "end", "from", "group", "having", "in", "insert", "into", "join", "left", "like",
    "limit", "not", "null", "on", "or", "order", "outer", "select", "set", "table", "then", "union",
    "update", "values", "when", "where",
  ],
  css: ["and", "from", "important", "media", "not", "only", "screen", "supports", "to"],
};

const CONSTANTS = new Set([
  "true", "false", "null", "undefined", "nil", "None", "True", "False", "NaN", "Infinity",
]);

const OPERATORS = new Set([
  "=", "==", "===", "!=", "!==", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "**", "&&", "||",
  "!", "&", "|", "^", "~", "?", ":", "=>", "->", "<-", ":=", "+=", "-=", "*=", "/=", "%=", "...",
]);

const PUNCTUATION = new Set(["{", "}", "(", ")", "[", "]", ";", ",", "."]);

export function languageOf(path: string): string {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "json", "jsonc"].includes(ext)) return "js";
  if (ext === "go") return "go";
  if (ext === "py") return "py";
  if (["sh", "bash", "zsh", "fish"].includes(ext)) return "sh";
  if (ext === "sql") return "sql";
  if (["css", "scss", "less"].includes(ext)) return "css";
  if (["html", "htm", "xml", "svg"].includes(ext)) return "html";
  return "text";
}

function commentPattern(language: string) {
  if (language === "py" || language === "sh") return /#.*$/;
  if (language === "html") return /<!--.*?-->/;
  return /\/\/.*$|\/\*.*?\*\//;
}

export function tokenize(line: string, language = "text"): SyntaxToken[] {
  if (language === "text" || line.length === 0) return line ? [{ text: line }] : [];

  const comment = commentPattern(language);
  const tokens: SyntaxToken[] = [];
  const keywords = new Set(KEYWORDS[language] ?? []);
  let index = 0;

  while (index < line.length) {
    const rest = line.slice(index);

    const commentMatch = rest.match(comment);
    if (commentMatch && commentMatch.index === 0) {
      tokens.push({ text: rest, kind: "comment" });
      break;
    }

    const stringMatch = rest.match(/^`(?:\\.|[^`\\])*`|^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'/);
    if (stringMatch) {
      tokens.push({ text: stringMatch[0], kind: "string" });
      index += stringMatch[0].length;
      continue;
    }

    const regexMatch = language === "js" ? rest.match(/^\/(?![*/])(?:\\.|[^/\\\n])+\/[gimsuy]*/) : null;
    if (regexMatch) {
      tokens.push({ text: regexMatch[0], kind: "regexp" });
      index += regexMatch[0].length;
      continue;
    }

    const numberMatch = rest.match(/^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (numberMatch) {
      tokens.push({ text: numberMatch[0], kind: "constant" });
      index += numberMatch[0].length;
      continue;
    }

    const wordMatch = rest.match(/^[A-Za-z_$][\w$]*/);
    if (wordMatch) {
      const word = wordMatch[0];
      let kind: SyntaxKind | undefined;
      if (keywords.has(word)) kind = "keyword";
      else if (CONSTANTS.has(word)) kind = "constant";
      else if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) kind = "type";
      else if (/^\s*\(/.test(rest.slice(word.length))) kind = "primitive";
      else if (/^\s*:/.test(rest.slice(word.length))) kind = "property";
      else if (language === "css") kind = "property";
      tokens.push({ text: word, kind });
      index += word.length;
      continue;
    }

    const operatorMatch = rest.match(/^[=!<>+\-*/%&|^~?:.]+/);
    if (operatorMatch) {
      const value = operatorMatch[0];
      if (PUNCTUATION.has(value)) tokens.push({ text: value, kind: "punctuation" });
      else if (OPERATORS.has(value)) tokens.push({ text: value, kind: "operator" });
      else tokens.push({ text: value, kind: "punctuation" });
      index += value.length;
      continue;
    }

    const punctuationMatch = rest.match(/^[{}()\[\];,]+/);
    if (punctuationMatch) {
      tokens.push({ text: punctuationMatch[0], kind: "punctuation" });
      index += punctuationMatch[0].length;
      continue;
    }

    const other = rest.match(/^[^A-Za-z0-9_$"'`/{}()\[\];,=!<>+\-*/%&|^~?:.\s]+/);
    if (other) {
      tokens.push({ text: other[0] });
      index += other[0].length;
      continue;
    }

    tokens.push({ text: rest[0] });
    index += 1;
  }

  return tokens;
}
