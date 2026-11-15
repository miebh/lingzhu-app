import type { EntryAttachment } from "./types";

/** Matches the core prompt attachment limits. */
export const MAX_ATTACHMENT_BYTES = 20 << 20;
export const MAX_ATTACHMENT_COUNT = 8;

/** Display name for an attachment that may arrive without a filename. */
export function attachmentName(name: string | undefined, mime: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (mime === "application/pdf") return "document.pdf";
  if (mime.startsWith("image/")) return "image";
  if (isTextAttachmentMime(mime)) return "attachment.txt";
  return "attachment";
}

/** Whether the core inlines this MIME type as prompt text. */
export function isTextAttachmentMime(mime: string): boolean {
  const value = mime.toLowerCase();
  if (value.startsWith("text/")) return true;
  switch (value) {
    case "application/json":
    case "application/xml":
    case "application/yaml":
    case "application/x-yaml":
    case "application/javascript":
    case "application/typescript":
    case "application/x-sh":
    case "application/toml":
      return true;
    default:
      return false;
  }
}

export function isSupportedAttachmentMime(mime: string): boolean {
  const value = mime.toLowerCase();
  return value.startsWith("image/") || value === "application/pdf" || isTextAttachmentMime(value);
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  xml: "application/xml",
  toml: "application/toml",
  js: "application/javascript",
  jsx: "application/javascript",
  ts: "application/typescript",
  tsx: "application/typescript",
  sh: "application/x-sh",
};

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "log", "html", "htm", "css", "go", "py", "rs", "java",
  "c", "h", "cpp", "hpp", "cs", "rb", "php", "swift", "kt", "kts", "scala", "lua", "sql",
  "ini", "cfg", "conf",
]);

/** Guesses a supported MIME from the browser file type or the extension. */
export function attachmentMimeForFile(name: string, type: string): string {
  const reported = type.trim().toLowerCase();
  if (reported && isSupportedAttachmentMime(reported)) return reported;
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (MIME_BY_EXTENSION[extension]) return MIME_BY_EXTENSION[extension];
  if (TEXT_EXTENSIONS.has(extension)) return "text/plain";
  return "";
}

/** Reads a dropped or pasted file into raw base64 for the prompt payload. */
export async function readFileBase64(file: Blob): Promise<string> {
  return toBase64(new Uint8Array(await file.arrayBuffer()));
}

/** Encodes UTF-8 text as base64 for the prompt payload. */
export function encodeTextBase64(text: string): string {
  return toBase64(new TextEncoder().encode(text));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Short range or kind label shown on an attachment chip. */
export function attachmentContextLabel(attachment: { kind?: string; start?: number; end?: number }): string {
  if (attachment.kind === "directory") return "dir";
  if (attachment.start && attachment.end) {
    return attachment.start === attachment.end ? `L${attachment.start}` : `L${attachment.start}-${attachment.end}`;
  }
  return "";
}

const LANGUAGE_NAMES = new Map(
  Object.entries({
    Assembly: ["asm", "s"],
    Astro: ["astro"],
    "Batch File": ["bat", "cmd"],
    C: ["c", "h"],
    "C#": ["cs"],
    "C++": ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
    Clojure: ["clj", "cljs", "cljc", "edn"],
    CSS: ["css"],
    CUDA: ["cu", "cuh"],
    Dart: ["dart"],
    Diff: ["diff", "patch"],
    Elixir: ["ex", "exs"],
    Elm: ["elm"],
    Erlang: ["erl", "hrl"],
    "F#": ["fs", "fsi", "fsx"],
    Fortran: ["f", "f77", "f90", "f95", "f03", "f08", "for"],
    GDScript: ["gd"],
    Gleam: ["gleam"],
    GLSL: ["glsl", "vert", "frag", "geom", "comp"],
    Go: ["go"],
    GraphQL: ["graphql", "gql"],
    Groovy: ["groovy", "gradle"],
    Haskell: ["hs"],
    HCL: ["hcl"],
    HLSL: ["hlsl"],
    HTML: ["html", "htm"],
    Java: ["java"],
    JavaScript: ["js", "cjs", "mjs"],
    JSON: ["json"],
    "JSON Lines": ["jsonl"],
    "JSON with Comments": ["jsonc"],
    JSON5: ["json5"],
    JSX: ["jsx"],
    Julia: ["jl"],
    Kotlin: ["kt", "kts"],
    LaTeX: ["tex", "latex"],
    Less: ["less"],
    Lua: ["lua"],
    Markdown: ["md", "markdown"],
    MDX: ["mdx"],
    Nim: ["nim"],
    Nix: ["nix"],
    OCaml: ["ml", "mli"],
    Perl: ["pl", "pm"],
    PHP: ["php"],
    PowerShell: ["ps1", "psm1"],
    "Protocol Buffer": ["proto"],
    Python: ["py", "pyi"],
    R: ["r"],
    Ruby: ["rb"],
    Rust: ["rs"],
    Sass: ["sass"],
    Scala: ["scala", "sbt"],
    SCSS: ["scss"],
    Shell: ["sh", "bash", "zsh"],
    Solidity: ["sol"],
    SQL: ["sql"],
    Svelte: ["svelte"],
    SVG: ["svg"],
    Swift: ["swift"],
    Terraform: ["tf", "tfvars"],
    TOML: ["toml"],
    TSX: ["tsx"],
    TypeScript: ["ts", "cts", "mts"],
    Vue: ["vue"],
    WebAssembly: ["wat", "wasm"],
    WGSL: ["wgsl"],
    XML: ["xml"],
    YAML: ["yaml", "yml"],
    Zig: ["zig"],
  }).flatMap(([name, extensions]) => extensions.map((extension) => [extension, name] as const)),
);

/**
 * The type label under a file attachment. Text attachments all arrive as
 * text/plain, so the extension names the language; PDFs and directories keep
 * their own labels.
 */
export function attachmentTypeLabel(name: string, mime: string, kind?: string): string {
  if (kind === "directory") return "Directory";
  if (mime === "application/pdf") return "PDF";
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const index = base.lastIndexOf(".");
  if (index <= 0) return "File";
  const suffix = base.slice(index + 1).toLowerCase();
  return LANGUAGE_NAMES.get(suffix) ?? suffix.toUpperCase();
}

/** Keeps only the display fields of event attachment payloads. */
export function entryAttachments(value: unknown): EntryAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value
    .map((item): EntryAttachment | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const mime = String(record.mime ?? "");
      if (!mime) return undefined;
      const name = record.name ? String(record.name) : undefined;
      const data = record.data ? String(record.data) : undefined;
      const kind = record.kind ? String(record.kind) : undefined;
      const start = Number(record.start ?? 0) || undefined;
      const end = Number(record.end ?? 0) || undefined;
      return { mime, name, data, kind, start, end };
    })
    .filter((item): item is EntryAttachment => item !== undefined);
  return attachments.length > 0 ? attachments : undefined;
}
