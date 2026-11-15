import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import {
  composerActiveIndex,
  composerSubmitMode,
  matchesComposerCommand,
  moveComposerSelection,
  slashQuery,
} from "../../../packages/app/src/lib/composer.ts";
import {
  clampPaletteIndex,
  filterPalette,
  groupPalette,
  movePaletteSelection,
  paletteInitial,
  splitPalettePath,
} from "../../../packages/app/src/lib/palette.ts";
import { attachmentContextLabel, entryAttachments, isSupportedAttachmentMime, isTextAttachmentMime } from "../../../packages/ui/src/attachments.ts";
import { modelLabel, modelVariantID, splitModelID } from "../../../packages/app/src/lib/models.ts";
import { diffLineNumber, formatReviewPrompt, parsePatch, addReviewComment, removeReviewComment, splitPatch } from "../../../packages/session-ui/src/review.ts";
import { isFilePanelTab } from "../../../packages/app/src/lib/sidePanel.ts";
import { addPanelTab, closePanelTabState, reorderPanelTabs } from "../../../packages/app/src/lib/panelTabs.ts";
import { sessionChanges, timelineRows } from "../../../packages/session-ui/src/timeline.ts";
import { reasoningDuration, reasoningHeading } from "../../../packages/session-ui/src/reasoning.ts";
import { effectiveTabLayout } from "../../../packages/app/src/lib/layout.ts";
import { setLanguage, t } from "../../../packages/ui/src/i18n.ts";

const sourceRoots = [
  new URL("../../../packages/app/src/", import.meta.url),
  new URL("../../../packages/session-ui/src/", import.meta.url),
  new URL("../../../packages/ui/src/", import.meta.url),
];

const source = async (path) => {
  const file = path === "index.css" ? "theme.css" : path;
  for (const root of sourceRoots) {
    try {
      return await readFile(new URL(file, root), "utf8");
    } catch {}
  }
  throw new Error(`source not found: ${path}`);
};
