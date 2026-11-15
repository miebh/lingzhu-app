import {
  FileDiff,
  VirtualizedFileDiff,
  Virtualizer,
  parsePatchFiles,
  registerCustomTheme,
} from "@pierre/diffs";
import "@pierre/highlights";

/** Syntax token groups mapped to app roles. */
const lingzhuTheme = {
  name: "Lingzhu",
  appearance: "dark" as const,
  cssVariables: { prefix: "--" },
  style: {
    "editor.background": "color-background-stronger",
    "editor.foreground": "text-base",
    created: "syntax-diff-add",
    deleted: "syntax-diff-delete",
    modified: "syntax-diff-unknown",
    syntax: {
      attribute: "syntax-property",
      background: "color-background-stronger",
      boolean: "syntax-constant",
      comment: "syntax-comment",
      constant: "syntax-constant",
      constructor: "syntax-type",
      "diff.minus": "syntax-diff-delete",
      "diff.plus": "syntax-diff-add",
      embedded: "text-base",
      emphasis: "text-base",
      enum: "syntax-type",
      foreground: "text-base",
      function: "syntax-primitive",
      hint: "syntax-comment",
      keyword: "syntax-keyword",
      "keyword.operator": "syntax-operator",
      label: "syntax-constant",
      link_text: "syntax-info",
      link_uri: "syntax-keyword",
      namespace: "syntax-constant",
      number: "syntax-constant",
      operator: "syntax-operator",
      predictive: { color: "syntax-comment", font_style: "italic" },
      preproc: "syntax-keyword",
      primary: "syntax-info",
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
      text: "text-base",
      "text.literal": "syntax-string",
      title: { color: "syntax-keyword", font_weight: 700 },
      type: "syntax-type",
      variable: "syntax-variable",
      "variable.parameter": "text-base",
      "variable.special": "syntax-constant",
      variant: "syntax-constant",
    },
  },
};

let registered = false;

function ensureLingzhuTheme() {
  if (registered) return;
  registered = true;
  registerCustomTheme(lingzhuTheme.name, () => Promise.resolve(lingzhuTheme), "zed");
}

export const pierreStyleVariables: Record<string, string> = {
  "--diffs-font-family": "var(--font-mono)",
  "--diffs-font-size": "13px",
  "--diffs-line-height": "24px",
  "--diffs-tab-size": "2",
  "--diffs-font-features": "normal",
  "--diffs-header-font-family": "var(--font-sans)",
  "--diffs-gap-block": "0",
  "--diffs-gap-style": "0",
  "--diffs-min-number-column-width": "3ch",
};

const pierreUnsafeCSS = `
:host {
  --diffs-bg: var(--bg-base);
  --diffs-bg-separator-override: light-dark(
    color-mix(in lab, var(--diffs-bg) 98%, var(--diffs-mixer)),
    color-mix(in lab, var(--diffs-bg) 95%, var(--diffs-mixer))
  );
  --diffs-bg-addition-emphasis-override: light-dark(
    rgb(from var(--diff-add-fg) r g b / 0.2),
    rgb(from var(--diff-add-fg) r g b / 0.4)
  );
  --diffs-bg-deletion-emphasis-override: light-dark(
    rgb(from var(--diff-remove-fg) r g b / 0.2),
    rgb(from var(--diff-remove-fg) r g b / 0.4)
  );
  --diffs-fg-number-override: var(--fg-faint);
  --diffs-fg-number-addition-override: var(--diff-add-fg);
  --diffs-fg-number-deletion-override: var(--diff-remove-fg);
  text-wrap-style: auto;
}

[data-diff],
[data-file] {
  --diffs-bg-deletion-override: light-dark(
    rgb(from var(--diff-remove-fg) r g b / 0.05),
    rgb(from var(--diff-remove-fg) r g b / 0.1)
  );
  --diffs-bg-deletion-number-override: var(--diffs-bg-deletion-override);
  --diffs-bg-addition-override: light-dark(
    rgb(from var(--diff-add-fg) r g b / 0.05),
    rgb(from var(--diff-add-fg) r g b / 0.1)
  );
  --diffs-bg-addition-number-override: var(--diffs-bg-addition-override);
  --diffs-selection-base: var(--bg-accent);
  --diffs-selection-number-fg: var(--fg-accent);
  --diffs-comment-bg: rgb(from var(--bg-accent) r g b / 0.06);
  --diffs-bg-selection: var(--diffs-bg-selection-override, rgb(from var(--diffs-selection-base) r g b / 0.2));
  --diffs-bg-selection-number: var(--diffs-bg-selection-number-override, var(--diffs-bg-selection));
}

[data-indicators='bars'] [data-column-number][data-line-type='change-addition']::before,
[data-indicators='bars'] [data-column-number][data-line-type='change-deletion']::before {
  width: 2px;
}

[data-indicators='bars'] [data-column-number][data-line-type='change-addition']::before {
  background-color: var(--diff-add-fg);
}

[data-indicators='bars'] [data-column-number][data-line-type='change-deletion']::before {
  background-image: none;
  background-color: var(--diff-remove-fg);
}

[data-background] [data-column-number] {
  --mix-light: 88%;
  --mix-dark: 80%;
}

[data-background]
  :is([data-line], [data-no-newline], [data-column-number], [data-gutter-buffer]):is(
    [data-line-type='change-addition'],
    [data-line-type='change-deletion']
  ) {
  --mix-light: 0%;
  --mix-dark: 0%;
}

[data-line-type='change-addition'] [data-diff-span],
[data-line-type='change-addition'] [data-diff-span] * {
  color: light-dark(var(--diff-add-fg), var(--fg-base)) !important;
}

[data-line-type='change-deletion'] [data-diff-span],
[data-line-type='change-deletion'] [data-diff-span] * {
  color: light-dark(var(--diff-remove-fg), var(--fg-base)) !important;
}

:is([data-separator-content], [data-expand-button]) {
  color: var(--fg-faint);
}

[data-expand-button]:hover {
  color: var(--diffs-fg);
}

[data-diff-type='split'] [data-additions],
[data-diff-type='split'] [data-additions] [data-gutter],
[data-diff-type='split'] [data-deletions],
[data-diff-type='split'] [data-deletions] [data-content] {
  border-left: 0;
  border-right: 0;
}

[data-content-buffer] {
  background-image: none;
  background-color: var(--diffs-bg-context-gutter);
}

[data-diff] [data-line][data-comment-selected]:not([data-selected-line]),
[data-file] [data-line][data-comment-selected]:not([data-selected-line]) {
  box-shadow: inset 0 0 0 9999px var(--diffs-bg-selection);
}

[data-diff] [data-column-number][data-comment-selected]:not([data-selected-line]),
[data-file] [data-column-number][data-comment-selected]:not([data-selected-line]) {
  box-shadow: inset 0 0 0 9999px var(--diffs-bg-selection-number);
  color: var(--diffs-selection-number-fg);
}

[data-diff] [data-line-annotation],
[data-diff] [data-gutter-buffer='annotation'],
[data-file] [data-line-annotation],
[data-file] [data-gutter-buffer='annotation'] {
  --diffs-annotation-bg: var(--diffs-comment-bg);
  --diffs-computed-decoration-bg: var(--diffs-comment-bg);
  --diffs-computed-diff-line-bg: var(--diffs-comment-bg);
  --diffs-computed-selected-line-bg: var(--diffs-comment-bg);
  --diffs-line-bg: var(--diffs-comment-bg);
  background-color: var(--diffs-comment-bg);
}

[data-diff] [data-line][data-selected-line],
[data-file] [data-line][data-selected-line] {
  background-color: var(--diffs-bg-selection);
}

[data-diff] [data-column-number][data-selected-line],
[data-file] [data-column-number][data-selected-line] {
  background-color: var(--diffs-bg-selection-number);
  color: var(--diffs-selection-number-fg);
}

[data-diff] [data-column-number][data-line-type='context'][data-selected-line],
[data-diff] [data-column-number][data-line-type='context-expanded'][data-selected-line],
[data-diff] [data-column-number][data-line-type='change-addition'][data-selected-line],
[data-diff] [data-column-number][data-line-type='change-deletion'][data-selected-line] {
  color: var(--diffs-selection-number-fg);
}

@media (max-width: 767px) {
  [data-file][data-overflow='wrap'] [data-code] {
    container-type: inline-size;
  }

  [data-file][data-overflow='wrap'] [data-line-annotation] {
    margin-inline-start: calc(100% - 100cqi);
    z-index: 4;
  }
}

@media (pointer: fine) {
  [data-gutter-utility-slot] {
    opacity: 0;
    pointer-events: none;
  }

  [data-column-number][data-hovered] [data-gutter-utility-slot],
  [data-gutter-utility-slot]:focus-within {
    opacity: 1;
    pointer-events: auto;
  }
}

[data-diff] [data-line][data-line-type='change-deletion'][data-selected-line] {
  --diffs-bg-deletion-emphasis: light-dark(
    rgb(from var(--diff-remove-fg) r g b / 0.07),
    rgb(from var(--diff-remove-fg) r g b / 0.1)
  );
}

[data-file]:not([data-disable-line-numbers]) :is([data-column-number], [data-gutter-buffer]) {
  padding-left: var(--lingzhu-diffs-number-inset, 2ch);
}

[data-diff-header],
[data-diff],
[data-file] {
  [data-separator] {
    height: 24px;
  }
  [data-column-number] {
    cursor: default !important;
  }

  &[data-interactive-line-numbers] [data-column-number] {
    cursor: default !important;
  }

  &[data-interactive-lines] [data-line] {
    cursor: auto !important;
  }
  [data-code] {
    overflow-x: auto !important;
    overflow-y: clip !important;
  }
}
`;

const pierreOptions = {
  theme: lingzhuTheme.name,
  preferredHighlighter: "highlights",
  themeType: "system",
  disableLineNumbers: false,
  overflow: "wrap",
  diffStyle: "unified",
  diffIndicators: "bars",
  lineHoverHighlight: "both",
  disableBackground: false,
  expansionLineCount: 20,
  hunkSeparators: "line-info-basic",
  lineDiffType: "word-line",
  maxLineDiffLength: 1000,
  maxLineLengthForHighlighting: 1000,
  disableFileHeader: true,
  unsafeCSS: pierreUnsafeCSS,
} as const;

/** Parses one unified patch into the metadata the renderer consumes. */
export function parseFileDiff(path: string, patch: string) {
  const patches = parsePatchFiles(patch);
  const files = patches.flatMap((entry) => entry.files ?? []);
  if (files.length === 0) return undefined;
  const normalized = path.replace(/^[ab]\//, "");
  return (
    files.find((file) => file.name.replace(/^[ab]\//, "") === normalized) ??
    files.find((file) => file.name.endsWith(normalized)) ??
    files[0]
  );
}

/** Mirrors the reference: long diffs use the shared Virtualizer window. */
export function createVirtualizedFileDiff(
  root: HTMLElement,
  wrapper: HTMLElement,
  virtual: boolean,
): { instance: FileDiff; virtualizer?: Virtualizer } {
  ensureLingzhuTheme();
  if (!virtual) return { instance: new FileDiff({ ...pierreOptions }) };
  const virtualizer = new Virtualizer();
  virtualizer.setup(root, wrapper);
  const instance = new VirtualizedFileDiff(
    { ...pierreOptions },
    virtualizer,
    { lineHeight: 24, hunkSeparatorHeight: 24, spacing: 0 },
  ) as unknown as FileDiff;
  return { instance, virtualizer };
}

let forcedAvailable: boolean | undefined;

/** Tests can force the Pierre path on or off; undefined restores the environment default. */
export function setPierreAvailable(value?: boolean) {
  forcedAvailable = value;
}

export function diffAvailable() {
  if (forcedAvailable !== undefined) return forcedAvailable;
  if (import.meta.env.MODE === "test") return false;
  return (
    typeof window !== "undefined" &&
    typeof HTMLElement !== "undefined" &&
    typeof customElements !== "undefined" &&
    typeof CSSStyleSheet !== "undefined"
  );
}
