import { entryAttachments } from "@lingzhu/ui/attachments";
import type { ChatState, InboxItem, PromptComment, TimelineEntry } from "@lingzhu/ui/types";

/**
 * Pending steering input as transcript rows. The rows are derived from the
 * durable inbox projection, so a refresh or delivery change re-derives them
 * instead of relying on an optimistic entry that history can overwrite.
 */
export function pendingEntries(inbox: InboxItem[] | undefined, chat: ChatState): TimelineEntry[] {
  if (!inbox?.length) return [];
  const rows: TimelineEntry[] = [];
  for (const item of inbox) {
    if (item.type !== "user" || item.delivery !== "steer") continue;
    const data = item.payload.data ?? {};
    rows.push({
      key: `pending:${item.id}`,
      role: "user",
      text: item.payload.text,
      attachments: entryAttachments(data.attachments),
      references: entryAttachments(data.references),
      comments: Array.isArray(data.comments) ? (data.comments as PromptComment[]) : undefined,
      voice: data.voice === true,
      pending: true,
      steer: true,
      created: item.time.created,
      agent: chat.agent,
      provider: chat.provider,
      model: chat.model,
    });
  }
  return rows;
}