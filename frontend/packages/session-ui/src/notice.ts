import type { MessageKey } from "@lingzhu/ui/i18n";
import type { TimelineEntry } from "@lingzhu/ui/types";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The localized label for a synthetic or compaction notice. */
export function noticeLabel(notice: NonNullable<TimelineEntry["notice"]>, tr: Translate): string {
  const actor =
    notice.source === "shell"
      ? tr("noticeShell")
      : notice.source === "subagent"
        ? tr("noticeSubagent")
        : notice.source === "schedule"
          ? tr("noticeSchedule")
          : notice.source === "instructions"
            ? tr("noticeInstructions")
            : tr("noticeForm");
  return notice.state === "error"
    ? tr("noticeFailed", { actor })
    : notice.state === "cancelled"
      ? tr("noticeCancelled", { actor })
      : tr("noticeFinished", { actor });
}

export function noticeText(notice: NonNullable<TimelineEntry["notice"]>, tr: Translate): string {
  const label = noticeLabel(notice, tr);
  return notice.description ? `${label} · ${notice.description}` : label;
}
