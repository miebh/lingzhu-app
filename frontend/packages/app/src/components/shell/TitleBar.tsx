import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { LayoutLeft, LayoutLeftFull, Menu } from "@lingzhu/ui/icons";
import { System, Events, Window } from "@wailsio/runtime";
import { Keybind } from "@lingzhu/ui/keybind";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { useT } from "@lingzhu/ui/i18n";
import { formatKeybind } from "../../lib/slash";
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
  sidebarKeybind?: string;
  /** Go menu's session navigation, wired to the same tab cycling as Ctrl+Tab. */
  onPreviousTab?: () => void;
  onNextTab?: () => void;
}

/**
 * Client-drawn window chrome. The bar keeps the reference desktop geometry:
 * a 44px Windows overlay row with the app menu and sidebar toggle on the left,
 * native-sized 46x32 caption controls at the top right, and a 36px row on macOS
 * with room for the traffic lights. Every control opts out of window dragging.
 */
export function TitleBar(props: Props) {
  const tr = useT();
  const mac = System.IsMac();
  const [maximised, setMaximised] = createSignal(false);

  // Browser accelerator keys are disabled by the desktop shell, so F12 would
  // otherwise do nothing. The dev build enables WebView2 DevTools; production
  // treats this call as a no-op.
  onMount(() => {
    const openDevTools = (event: KeyboardEvent) => {
      const shortcut = event.key === "F12" || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "i");
      if (!shortcut) return;
      event.preventDefault();
      void Window.OpenDevTools().catch(() => undefined);
    };
    window.addEventListener("keydown", openDevTools, true);
    onCleanup(() => window.removeEventListener("keydown", openDevTools, true));
  });

  // The window manager reports the maximised state natively, so the caption
  // glyph follows the real window instead of a debounced poll on every resize.
  // `WindowRestore` also covers dragging a maximised window back down, and it
  // fires per frame during a live resize, so it only flips a boolean instead of
  // asking the host again.
  onMount(() => {
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
    onCleanup(() => {
      alive = false;
      for (const unsubscribe of off) unsubscribe();
    });
  });

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
      class={`titlebar flex shrink-0 select-none items-center bg-bg-deep ${
        mac ? "h-chrome-titlebar-mac" : "h-chrome-titlebar"
      }`}
      onDblClick={(event) => {
        if (mac) return;
        if ((event.target as HTMLElement).closest("[data-window-control]")) return;
        void toggleMaximise();
      }}
    >
      <div
        class={`flex h-full min-w-0 flex-1 items-center gap-1.5 ${mac ? "pl-[74px] pr-2" : "ps-[9px] pe-1.5"}`}
      >
        <Show when={props.onOpenDrawer}>
          <button
            type="button"
            data-window-control
            aria-label={tr("openSidebar")}
            title={tr("openSidebar")}
            onClick={() => props.onOpenDrawer?.()}
            class="window-control interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
          >
            <Menu class="size-4" />
          </button>
        </Show>
        <Show when={!mac && !props.onOpenDrawer}>
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              data-window-control
              aria-label={tr("applicationMenu")}
              title={tr("applicationMenu")}
              class="window-control interactive grid h-7 w-9 shrink-0 place-items-center rounded-[6px] px-1 text-text-faint hover:text-text-base"
            >
              <Menu class="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              class="app-menu w-40 border border-border-muted bg-bg-raised"
            >
              <DropdownMenuLabel class="h-7 px-3 text-caption font-[530] leading-none tracking-[0.05px] text-text-faint">
                Lingzhu
              </DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuFile")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent class="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => props.onNewSession?.()} class="justify-between pe-3">
                    {tr("newSession")}
                    <MenuShortcut label="Ctrl+T" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => props.onOpenSettings?.()} class="justify-between pe-3">
                    {tr("settings")}
                    <MenuShortcut label="Ctrl+," />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void Window.Close()} class="justify-between pe-3">
                    {tr("closeWindow")}
                    <MenuShortcut label="Ctrl+Shift+W" />
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuEdit")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent class="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => runEdit("undo")} class="justify-between pe-3">
                    {tr("undoAction")}
                    <MenuShortcut label="Ctrl+Z" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("redo")} class="justify-between pe-3">
                    {tr("redoAction")}
                    <MenuShortcut label="Ctrl+Y" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => runEdit("cut")} class="justify-between pe-3">
                    {tr("cutAction")}
                    <MenuShortcut label="Ctrl+X" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("copy")} class="justify-between pe-3">
                    {tr("copyAction")}
                    <MenuShortcut label="Ctrl+C" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("paste")} class="justify-between pe-3">
                    {tr("pasteAction")}
                    <MenuShortcut label="Ctrl+V" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("delete")}>{tr("removeAction")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runEdit("selectAll")} class="justify-between pe-3">
                    {tr("selectAllAction")}
                    <MenuShortcut label="Ctrl+A" />
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuView")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent class="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem
                    onSelect={() => props.onToggleSidebar?.()}
                    disabled={!props.onToggleSidebar}
                    class="justify-between pe-3"
                  >
                    {tr("shortcutToggleSidebar")}
                    <MenuShortcut label="Ctrl+Shift+B" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => window.location.reload()}>{tr("reloadAction")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void toggleFullscreen()}>{tr("toggleFullscreen")}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuGo")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent class="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => window.history.back()}>{tr("backAction")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => window.history.forward()}>{tr("forwardAction")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => props.onPreviousTab?.()} disabled={!props.onPreviousTab}>
                    {tr("previousSession")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => props.onNextTab?.()} disabled={!props.onNextTab}>
                    {tr("nextSession")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuWindow")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent class="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => void Window.Minimise()}>{tr("minimiseAction")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void toggleMaximise()}>
                    {maximised() ? tr("restoreAction") : tr("maximiseAction")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void Window.Close()}>{tr("closeWindow")}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr("menuHelp")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent class="app-menu min-w-60 border border-border-muted bg-bg-raised max-w-[min(320px,calc(100vw-24px))]">
                  <DropdownMenuItem onSelect={() => props.onOpenSettings?.()}>{tr("about")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => props.onOpenPalette?.()} class="justify-between pe-3">
                    {tr("commandPalette")}
                    <MenuShortcut label="Ctrl+K" />
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>
        <Show when={props.onToggleSidebar}>
          <Tooltip>
            <TooltipTrigger
              type="button"
              data-window-control
              aria-label={props.sidebarOpen ? tr("hideSidebar") : tr("showSidebar")}
              aria-expanded={Boolean(props.sidebarOpen)}
              onClick={() => props.onToggleSidebar?.()}
              class="window-control interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
            >
              <Show when={props.sidebarOpen} fallback={<LayoutLeft class="size-4" />}>
                <LayoutLeftFull class="size-4" />
              </Show>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span class="flex items-center gap-1.5">
                {props.sidebarOpen ? tr("hideSidebar") : tr("showSidebar")}
                <Show when={props.sidebarKeybind}>
                  {(keybind) => <Keybind keys={(formatKeybind(keybind()) ?? "").split("+")} />}
                </Show>
              </span>
            </TooltipContent>
          </Tooltip>
        </Show>
      </div>

      <Show when={!mac}>
        <div class="flex h-full shrink-0 items-start">
          <CaptionButton label={tr("minimiseAction")} onClick={() => void Window.Minimise()}>
            <CaptionGlyph kind="minimise" />
          </CaptionButton>
          <CaptionButton
            label={maximised() ? tr("restoreAction") : tr("maximiseAction")}
            onClick={() => void toggleMaximise()}
          >
            <CaptionGlyph kind={maximised() ? "restore" : "maximise"} />
          </CaptionButton>
          <CaptionButton label={tr("closeAction")} variant="close" onClick={() => void Window.Close()}>
            <CaptionGlyph kind="close" />
          </CaptionButton>
        </div>
      </Show>
    </header>
  );
}

function MenuShortcut(props: { label: string }) {
  return <span class="shrink-0 text-caption font-[440] text-text-faint">{props.label}</span>;
}

function CaptionGlyph(props: { kind: "minimise" | "maximise" | "restore" | "close" }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <Show when={props.kind === "minimise"}>
        <path d="M0 5.5H10" stroke="currentColor" stroke-width="1" />
      </Show>
      <Show when={props.kind === "maximise"}>
        <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" stroke-width="1" />
      </Show>
      <Show when={props.kind === "restore"}>
        <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" stroke-width="1" />
        <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" stroke-width="1" />
      </Show>
      <Show when={props.kind === "close"}>
        <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" stroke-width="1" />
      </Show>
    </svg>
  );
}

function CaptionButton(props: { label: string; variant?: "close"; onClick: () => void; children?: JSX.Element }) {
  return (
    <button
      type="button"
      data-window-control
      data-variant={props.variant}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      class="window-control interactive grid h-caption-height w-caption-button place-items-center text-text-muted [&_svg]:size-[10px]"
    >
      {props.children}
    </button>
  );
}
