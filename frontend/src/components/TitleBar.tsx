import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Copy, Minus, Square, X } from "lucide-react";
import { System, Window } from "@wailsio/runtime";

interface Props {
  workspace?: string;
  title?: string;
}

/**
 * Client-drawn window chrome. The bar is the window drag region; every control
 * inside it opts out of dragging. macOS keeps its native traffic lights, so the
 * custom caption buttons are only rendered on Windows and Linux.
 */
export function TitleBar({ workspace, title }: Props) {
  const mac = System.IsMac();
  const [maximised, setMaximised] = useState(false);

  useEffect(() => {
    if (mac) return;
    let alive = true;
    let timer: number | undefined;
    const read = () => {
      void Window.IsMaximised()
        .then((value) => {
          if (alive) setMaximised(value);
        })
        .catch(() => undefined);
    };
    const sync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 120);
    };
    read();
    // Maximising fires a resize; re-reading the state keeps the glyph honest.
    window.addEventListener("resize", sync);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("resize", sync);
    };
  }, [mac]);

  const toggleMaximise = async () => {
    try {
      await Window.ToggleMaximise();
      setMaximised(await Window.IsMaximised());
    } catch {
      // Window controls are best-effort outside the Wails runtime.
    }
  };

  return (
    <header
      aria-label="Window title bar"
      className="titlebar flex h-chrome-titlebar shrink-0 select-none items-center border-b border-border-base bg-bg-base"
      onDoubleClick={(event) => {
        if (mac) return;
        if ((event.target as HTMLElement).closest("[data-window-control]")) return;
        void toggleMaximise();
      }}
    >
      <div
        className={`flex h-full w-sidebar shrink-0 items-center gap-2 border-r border-border-base ${
          mac ? "pl-20 pr-3" : "px-3"
        }`}
      >
        <span className="text-body font-medium text-text-base">lingzhu</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-inset-page">
        {workspace && <span className="shrink-0 text-meta text-text-faint">{workspace}</span>}
        {workspace && title && <ChevronRight className="size-3 shrink-0 text-text-faint" />}
        {title && <h1 className="min-w-0 truncate text-body font-medium text-text-base">{title}</h1>}
      </div>

      <div className="flex h-full shrink-0 items-center gap-1 pl-1">
        {!mac && (
          <div className="flex h-full items-center">
            <span aria-hidden className="mr-1 h-4 w-px bg-border-base" />
            <CaptionButton label="Minimise" onClick={() => void Window.Minimise()}>
              <Minus />
            </CaptionButton>
            <CaptionButton label={maximised ? "Restore" : "Maximise"} onClick={() => void toggleMaximise()}>
              {maximised ? <Copy /> : <Square />}
            </CaptionButton>
            <CaptionButton label="Close" variant="close" onClick={() => void Window.Close()}>
              <X />
            </CaptionButton>
          </div>
        )}
      </div>
    </header>
  );
}

function CaptionButton({
  label,
  variant,
  onClick,
  children,
}: {
  label: string;
  variant?: "close";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-window-control
      data-variant={variant}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="window-control interactive grid h-full w-chrome-button place-items-center text-text-muted [&_svg]:size-3"
    >
      {children}
    </button>
  );
}
