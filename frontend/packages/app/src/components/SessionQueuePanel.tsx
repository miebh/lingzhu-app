import { Trash2 } from "@lingzhu/ui/icons";
import type { InboxItem } from "@lingzhu/ui/types";

interface Props {
  items: InboxItem[];
  busy?: boolean;
  onRemove: (id: string) => void;
  onToggleDelivery: (item: InboxItem) => void;
  onEdit: (item: InboxItem) => void;
}

/**
 * Prompts queued behind the active turn, attached to the composer like the
 * reference pull-out. Each row can be recalled into the editor, switched
 * between steer and queue delivery, or removed.
 */
export function SessionQueuePanel({ items, busy, onRemove, onToggleDelivery, onEdit }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-session shrink-0 px-4 pb-2 md:px-6">
      <div className="rounded-xl bg-bg-base px-1.5 pt-1.5 pb-1 shadow-[inset_0_0_0_0.5px_var(--border-base)]">
        {items.length > 3 && (
          <div className="px-1.5 pt-1 pb-px text-[11px] leading-3 font-[530] tracking-[0.05px] text-text-muted uppercase tabular-nums">
            {items.length} queued
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex h-8 shrink-0 items-center gap-2 rounded-md pe-1 ps-0.5">
            <button
              type="button"
              onClick={() => onEdit(item)}
              title={item.payload.text}
              aria-label={`Edit queued prompt: ${item.payload.text || item.id}`}
              className="interactive min-w-0 flex-1 truncate rounded-xs px-1.5 text-left text-body leading-4 text-text-muted hover:text-text-base"
            >
              {item.payload.text || "(no text)"}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Change delivery for ${item.payload.text || item.id}`}
              onClick={() => onToggleDelivery(item)}
              className="interactive shrink-0 rounded-xs px-1.5 text-caption leading-4 tracking-[0.05px] text-text-faint uppercase hover:text-text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.delivery}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove queued prompt ${item.payload.text || item.id}`}
              onClick={() => onRemove(item.id)}
              className="interactive grid size-6 shrink-0 place-items-center rounded-xs text-text-faint hover:text-state-fg-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
