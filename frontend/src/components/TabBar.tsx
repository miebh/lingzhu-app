import { useRef } from "react";
import { X } from "lucide-react";

export type AppTabID = "chat" | "settings";

export interface AppTab {
  id: AppTabID;
  label: string;
  closable?: boolean;
  status?: "ongoing" | "warning" | "failed";
}

interface Props {
  tabs: AppTab[];
  active: AppTabID;
  onSelect: (id: AppTabID) => void;
  onClose: (id: AppTabID) => void;
}

/**
 * Tab strip above the main pane. The chat view is permanent; pages such as
 * settings join it as closable tabs. Focus follows arrow keys so the strip
 * stays a single tab stop.
 */
export function TabBar({ tabs, active, onSelect, onClose }: Props) {
  const buttons = useRef<Partial<Record<AppTabID, HTMLButtonElement | null>>>({});

  const move = (direction: 1 | -1) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index === -1) return;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    onSelect(next.id);
    buttons.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Main views"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }}
      className="flex h-control-md shrink-0 select-none items-center gap-1 border-b border-border-base bg-bg-base px-2"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <div
            key={tab.id}
            role="presentation"
            data-selected={selected ? "true" : undefined}
            className={`interactive flex h-control-xs w-tab shrink-0 items-center rounded-md ${
              selected ? "text-text-base" : "text-text-faint hover:text-text-muted"
            }`}
          >
            <button
              ref={(element) => {
                buttons.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-meta focus-visible:-outline-offset-2"
            >
              {tab.status && <StatusDot status={tab.status} />}
              <span className="truncate">{tab.label}</span>
            </button>

            {tab.closable && (
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                onClick={() => onClose(tab.id)}
                className="interactive grid size-control-xs shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base focus-visible:-outline-offset-2"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: NonNullable<AppTab["status"]> }) {
  return (
    <span
      className={`size-2 shrink-0 rounded-full bg-current ${
        status === "warning"
          ? "text-state-fg-warning"
          : status === "ongoing"
            ? "text-text-accent motion-safe:animate-pulse"
            : "text-state-fg-danger"
      }`}
    />
  );
}
