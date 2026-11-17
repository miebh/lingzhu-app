import type { MessageKey } from "@lingzhu/ui/i18n";
import type { TimelineEntry } from "@lingzhu/ui/types";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The prompt sections an instruction update can name. */
const instructionSourceKeys: Record<string, MessageKey> = {
  codemode: "instructionSourceCodemode",
  mcp: "instructionSourceMcp",
  references: "instructionSourceReferences",
  skills: "instructionSourceSkills",
  agents: "instructionSourceAgents",
  instructions: "instructionSourceInstructions",
  date: "instructionSourceDate",
  environment: "instructionSourceEnvironment",
  extra: "instructionSourceExtra",
};

/** Localized names for the sections an instruction update changed. */
export function instructionSourceLabels(
  notice: NonNullable<TimelineEntry["notice"]>,
  tr: Translate,
): string[] {
  return (notice.sources ?? []).map((key) => {
    const messageKey = instructionSourceKeys[key];
    return messageKey ? tr(messageKey) : key;
  });
}

/** The localized label for a synthetic or compaction notice. */
export function noticeLabel(notice: NonNullable<TimelineEntry["notice"]>, tr: Translate): string {
  // An instruction update is informational; it has no actor and no outcome.
  if (notice.source === "instructions") return tr("instructionsUpdated");
  const actor =
    notice.source === "shell"
      ? tr("noticeShell")
      : notice.source === "subagent"
        ? tr("noticeSubagent")
        : notice.source === "schedule"
          ? tr("noticeSchedule")
          : tr("noticeForm");
  return notice.state === "error"
    ? tr("noticeFailed", { actor })
    : notice.state === "cancelled"
      ? tr("noticeCancelled", { actor })
      : tr("noticeFinished", { actor });
}

export function noticeText(notice: NonNullable<TimelineEntry["notice"]>, tr: Translate): string {
  const label = noticeLabel(notice, tr);
  const detail =
    notice.source === "instructions"
      ? instructionSourceLabels(notice, tr).join(", ")
      : notice.description;
  return detail ? `${label} · ${detail}` : label;
}
