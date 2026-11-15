import { useEffect, useState, type ReactNode } from "react";
import { Grid2x2Plus, LayoutLeft, LayoutLeftFull, Menu, Search } from "@lingzhu/ui/icons";
import { System, Events, Window } from "@wailsio/runtime";
import { Keybind } from "@lingzhu/ui/keybind";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { useT } from "@lingzhu/ui/i18n";
import { formatKeybind } from "../lib/slash";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";

interface Props {
  /** Narrow screens open the session drawer instead of the docked rail. */
  onOpenDrawer?: () => void;
  /** Docked vertical sidebar state and toggle. */
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** App menu entries; the reference desktop titlebar leads with this menu. */
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
  onNewSession?: () => void;
  /** Horizontal layout's Home and Search entries, matching the reference titlebar cluster. */
  onHome?: () => void;
  onSearch?: () => void;
  /** Home is the active route; the trigger keeps the pressed overlay. */
  homeActive?: boolean;
  searchKeybind?: string;
  sidebarKeybind?: string;
  /** Go menu's session navigation, wired to the same tab cycling as Ctrl+Tab. */
  onPreviousTab?: () => void;
  onNextTab?: () => void;
  /** Horizontal tab strip, rendered inside the chrome row like the reference. */
  children?: ReactNode;
}

/**
 * Client-drawn window chrome. The bar keeps the reference desktop geometry:
 * a 44px Windows overlay row with the app menu and sidebar toggle on the left,
 * native-sized 46x32 caption controls at the top right, and a 36px row on macOS
 * with room for the traffic lights. Every control opts out of window dragging.
 */
export function TitleBar({
  onOpenDrawer,
  sidebarOpen,
  onToggleSidebar,
  onOpenSettings,
  onOpenPalette,
  onNewSession,
  onHome,
  onSearch,
  homeActive,
  searchKeybind,
  sidebarKeybind,
  onPreviousTab,
  onNextTab,
  children,
}: Props) {
  const tr = useT();
  const mac = System.IsMac();
  const [maximised, setMaximised] = useState(false);

  // Browser accelerator keys are disabled by the desktop shell, so F12 would
  // otherwise do nothing. The dev build enables WebView2 DevTools; production
  // treats this call as a no-op.
  useEffect(() => {
    const openDevTools = (event: KeyboardEvent) => {
      const shortcut = event.key === "F12" || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "i");
      if (!shortcut) return;
      event.preventDefault();
      void Window.OpenDevTools().catch(() => undefined);
    };
    window.addEventListener("keydown", openDevTools, true);
    return () => window.removeEventListener("keydown", openDevTools, true);
  }, []);

  // The window manager reports the maximised state natively, so the caption
  // glyph follows the real window instead of a debounced poll on every resize.
  // `WindowRestore` also covers dragging a maximised window back down, and it
  // fires per frame during a live resize, so it only flips a boolean instead of
  // asking the host again.
  useEffect(() => {
    if (mac) return;
    let alive = true;
    void Window.IsMaximised()
      .then((value) => {
        if (alive) setMaximised(value);
      })
      .catch(() => undefined);
    const off = [
      Events.On("common:WindowMaximise", () => setMaximised(true)),
      Events.On("common:WindowUnMaximise", () => setMaximised(false)),
      Events.On("common:WindowRestore", () => setMaximised(false)),
    ];
    return () => {
      alive = false;
      for (const unsubscribe of off) unsubscribe();
    };
  }, [mac]);

  const toggleMaximise = async () => {
    try {
      await Window.ToggleMaximise();
    } catch {
      // Window controls are best-effort outside the Wails runtime.
    }
  };

  const runEdit = (command: string) => {
    try {
      document.execCommand(command);
    } catch {
      // Editing commands are best-effort when no editable field is focused.
    }
  };

  const applyZoom = async (direction: "in" | "out" | "reset") => {
    const levels = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    try {
      const current = await Window.GetZoom();
      const next =
        direction === "reset"
          ? 1
          : direction === "in"
            ? (levels.find((level) => level > current + 0.01) ?? levels[levels.length - 1])
            : ([...levels].reverse().find((level) => level < current - 0.01) ?? levels[0]);
      await Window.SetZoom(next);
    } catch {
      // Zoom lives in the host window; a browser preview ignores it.
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (await Window.IsFullscreen()) await Window.UnFullscreen();
      else await Window.Fullscreen();
    } catch {
      // Fullscreen is best-effort outside the Wails runtime.
    }
  };

  return (
    <header
      aria-label={tr("titlebarLabel")}
      className={`titlebar flex shrink-0 select-none items-center bg-bg-deep ${
        mac ? "h-chrome-titlebar-mac" : "h-chrome-titlebar"
      }`}
      onDoubleClick={(event) => {
        if (mac) return;
        if ((event.target as HTMLElement).closest("[data-window-control]")) return;
        void toggleMaximise();
      }}
    >
      <div
        className={`flex h-full min-w-0 items-center gap-1.5 ${children ? "shrink-0" : "flex-1"} ${mac ? "pl-[74px] pr-2" : "ps-[9px] pe-1.5"}`}
      >
        {onOpenDrawer && (
          <button
            type="button"
            data-window-control
            aria-label={tr("openSidebar")}
            title={tr("openSidebar")}
            onClick={onOpenDrawer}
            className="window-control interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
          >
            <Menu className="size-4" />
          </button>
        )}
        {!mac && !onOpenDrawer && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-window-control
                aria-label={tr("applicationMenu")}
                title={tr("applicationMenu")}
                className="window-control interactive grid h-7 w-9 shrink-0 place-items-center rounded-[6px] px-1 text-text-faint hover:text-text-base"
              >
                <Menu className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="app-menu w-40 border border-border-muted bg-bg-raised"
            >
              <DropdownMenuLabel className="h-7 px-3 text-caption font-[530] leading-none tracking-[0.05px] text-text-faint">
                Lingzhu
              </DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuFile")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => onNewSession?.()} className="justify-between pe-3">
                    {tr("newSession")}
                    <MenuShortcut label="Ctrl+T" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onOpenSettings?.()} className="justify-between pe-3">
                    {tr("settings")}
                    <MenuShortcut label="Ctrl+," />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void Window.Close()} className="justify-between pe-3">
                    {tr("closeWindow")}
                    <MenuShortcut label="Ctrl+Shift+W" />
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuEdit")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => runEdit("undo")} className="justify-between pe-3">
                    {tr("undoAction")}
                    <MenuShortcut label="Ctrl+Z" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("redo")} className="justify-between pe-3">
                    {tr("redoAction")}
                    <MenuShortcut label="Ctrl+Y" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => runEdit("cut")} className="justify-between pe-3">
                    {tr("cutAction")}
                    <MenuShortcut label="Ctrl+X" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("copy")} className="justify-between pe-3">
                    {tr("copyAction")}
                    <MenuShortcut label="Ctrl+C" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("paste")} className="justify-between pe-3">
                    {tr("pasteAction")}
                    <MenuShortcut label="Ctrl+V" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("delete")}>{tr("removeAction")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("selectAll")} className="justify-between pe-3">
                    {tr("selectAllAction")}
                    <MenuShortcut label="Ctrl+A" />
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuView")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem
                    onSelect={() => onToggleSidebar?.()}
                    disabled={!onToggleSidebar}
                    className="justify-between pe-3"
                  >
                    {tr("shortcutToggleSidebar")}
                    <MenuShortcut label="Ctrl+Shift+B" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => window.location.reload()}>{tr("reloadAction")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void applyZoom("reset")} className="justify-between pe-3">
                    {tr("actualSize")}
                    <MenuShortcut label="Ctrl+0" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void applyZoom("in")} className="justify-between pe-3">
                    {tr("zoomIn")}
                    <MenuShortcut label="Ctrl++" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void applyZoom("out")} className="justify-between pe-3">
                    {tr("zoomOut")}
                    <MenuShortcut label="Ctrl+-" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void toggleFullscreen()}>{tr("toggleFullscreen")}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuGo")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => window.history.back()}>{tr("backAction")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => window.history.forward()}>{tr("forwardAction")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onPreviousTab?.()} disabled={!onPreviousTab}>
                    {tr("previousSession")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onNextTab?.()} disabled={!onNextTab}>
                    {tr("nextSession")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuWindow")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => void Window.Minimise()}>{tr("minimiseAction")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void toggleMaximise()}>
                    {maximised ? tr("restoreAction") : tr("maximiseAction")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void Window.Close()}>{tr("closeWindow")}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuHelp")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => onOpenSettings?.()}>{tr("about")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onOpenPalette?.()} className="justify-between pe-3">
                    {tr("commandPalette")}
                    <MenuShortcut label="Ctrl+K" />
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {onToggleSidebar && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-window-control
                aria-label={sidebarOpen ? tr("hideSidebar") : tr("showSidebar")}
                aria-expanded={Boolean(sidebarOpen)}
                onClick={onToggleSidebar}
                className="window-control interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
              >
                {sidebarOpen ? <LayoutLeftFull className="size-4" /> : <LayoutLeft className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="flex items-center gap-1.5">
                {sidebarOpen ? tr("hideSidebar") : tr("showSidebar")}
                {sidebarKeybind && <Keybind keys={(formatKeybind(sidebarKeybind) ?? "").split("+")} />}
              </span>
            </TooltipContent>
          </Tooltip>
        )}
        {(onHome || onSearch) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onHome && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-window-control
                    aria-label={tr("home")}
                    aria-pressed={Boolean(homeActive)}
                    data-state={homeActive ? "pressed" : undefined}
                    onClick={onHome}
                    className="window-control interactive grid h-7 w-9 shrink-0 place-items-center rounded-[6px] px-1 text-text-faint hover:text-text-base"
                  >
                    <Grid2x2Plus className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tr("home")}</TooltipContent>
              </Tooltip>
            )}
            {onSearch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-window-control
                    aria-label={tr("searchSessions")}
                    onClick={onSearch}
                    className="window-control interactive grid h-7 w-9 shrink-0 place-items-center rounded-[6px] px-1 text-text-faint hover:text-text-base"
                  >
                    <Search className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <span className="flex items-center gap-1.5">
                    {tr("searchSessions")}
                    {searchKeybind && <Keybind keys={(formatKeybind(searchKeybind) ?? "").split("+")} />}
                  </span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {children && <div className="flex h-full min-w-0 flex-1 items-center pe-3">{children}</div>}

      {!mac && (
        <div className="flex h-full shrink-0 items-start">
          <CaptionButton label={tr("minimiseAction")} onClick={() => void Window.Minimise()}>
            <CaptionGlyph kind="minimise" />
          </CaptionButton>
          <CaptionButton
            label={maximised ? tr("restoreAction") : tr("maximiseAction")}
            onClick={() => void toggleMaximise()}
          >
            <CaptionGlyph kind={maximised ? "restore" : "maximise"} />
          </CaptionButton>
          <CaptionButton label={tr("closeAction")} variant="close" onClick={() => void Window.Close()}>
            <CaptionGlyph kind="close" />
          </CaptionButton>
        </div>
      )}
    </header>
  );
}

function MenuShortcut({ label }: { label: string }) {
  return <span className="shrink-0 text-caption font-[440] text-text-faint">{label}</span>;
}

function CaptionGlyph({ kind }: { kind: "minimise" | "maximise" | "restore" | "close" }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      {kind === "minimise" && <path d="M0 5.5H10" stroke="currentColor" strokeWidth="1" />}
      {kind === "maximise" && <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />}
      {kind === "restore" && (
        <>
          <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
          <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" strokeWidth="1" />
        </>
      )}
      {kind === "close" && <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1" />}
    </svg>
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
      className="window-control interactive grid h-caption-height w-caption-button place-items-center text-text-muted [&_svg]:size-[10px]"
    >
      {children}
    </button>
  );
}
