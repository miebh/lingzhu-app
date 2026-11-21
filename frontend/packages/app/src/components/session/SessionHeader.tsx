import { For, Show, createMemo, type JSX } from "solid-js";
import { MoreHorizontal } from "@lingzhu/ui/icons";
import { Keybind } from "@lingzhu/ui/keybind";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { SessionContextButton } from "./SessionContextButton";
import type { ContextUsage } from "../../lib/contextUsage";
import { SessionLocationMenu } from "./SessionLocationMenu";
import { formatKeybind } from "../../lib/slash";
import { useT } from "@lingzhu/ui/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";

export interface SessionHeaderAction {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  separated?: boolean;
}

interface Props {
  workspace?: string;
  workspaceIcon?: string;
  workspaceColor?: string;
  /** Branch or directory name of the worktree that owns this workspace. */
  worktree?: string;
  /** Directory the active session runs in. */
  directory?: string;
  title?: string;
  /** Parent and grandparent sessions of a child session, oldest first. */
  ancestors?: { id: string; title: string }[];
  running?: boolean;
  onOpenProjectSettings?: () => void;
  onOpenProjectHome?: () => void;
  onOpenSession?: (id: string) => void;
  actions?: SessionHeaderAction[];
  /** The session-context control: usage ring, prompt size and spend. */
  context?: {
    usage: ContextUsage;
    /** The Details pane is the one showing. */
    detailsOpen: boolean;
    onOpenDetails: () => void;
  };
  /** Reserves the trailing slot the floating review toggle occupies. */
  reserveEnd?: boolean;
  /** Header end inset: 10px beside vertical tabs, 12px beside the horizontal strip. */
  endInset?: number;
  /** Summary control rendered before the session menu and context ring. */
  summary?: JSX.Element;
}

/** A slash separating two segments of the breadcrumb. */
function HeaderSeparator() {
  return (
    <span class="shrink-0 text-[13px] leading-4 text-icon-faint" aria-hidden="true">
      /
    </span>
  );
}

/** One clickable ancestor session in the breadcrumb. */
function SessionAncestorLink(props: {
  id: string;
  title: string;
  last: boolean;
  onOpenSession?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-slot={props.last ? "session-title-parent" : "session-title-ancestor"}
      data-session-id={props.id}
      title={props.title}
      onClick={() => props.onOpenSession?.(props.id)}
      class="max-w-[min(200px,40vw)] shrink-0 truncate px-1 text-[13px] leading-4 font-[530] tracking-[-0.04px] text-text-faint transition-colors hover:text-text-muted"
    >
      <bdi dir="auto">{props.title}</bdi>
    </button>
  );
}

/** The title of the session this header belongs to. */
function SessionTitle(props: { title: string }) {
  return (
    <h1 class="w-fit min-w-0 max-w-full shrink truncate rounded-md px-1 py-1.5 text-[13px] leading-4 font-[530] tracking-[-0.04px] text-text-base">
      {props.title}
    </h1>
  );
}

/** The breadcrumb: project location, ancestor sessions and the title. */
function SessionBreadcrumb(props: {
  workspace?: string;
  workspaceIcon?: string;
  workspaceColor?: string;
  worktree?: string;
  directory?: string;
  title?: string;
  ancestors: { id: string; title: string }[];
  running?: boolean;
  onOpenProjectSettings?: () => void;
  onOpenProjectHome?: () => void;
  onOpenSession?: (id: string) => void;
}) {
  // Child sessions show only the project; the worktree label belongs to the
  // top-level workspace and would misplace a delegated task.
  const location = createMemo(() =>
    [props.workspace, props.ancestors.length > 0 ? "" : props.worktree].filter(Boolean).join(" / "),
  );
  return (
    <div class="flex min-w-0 flex-1 items-center gap-1">
      <SessionLocationMenu
        workspace={props.workspace}
        workspaceIcon={props.workspaceIcon}
        workspaceColor={props.workspaceColor}
        directory={props.directory}
        worktree={props.ancestors.length > 0 ? undefined : props.worktree}
        label={location()}
        onOpenProject={props.onOpenProjectHome}
        onOpenSettings={props.onOpenProjectSettings}
      />
      <For each={props.ancestors}>
        {(ancestor, index) => (
          <>
            <HeaderSeparator />
            <SessionAncestorLink
              id={ancestor.id}
              title={ancestor.title}
              last={index() === props.ancestors.length - 1}
              onOpenSession={props.onOpenSession}
            />
          </>
        )}
      </For>
      <Show when={props.workspace && (props.title || props.ancestors.length > 0)}>
        <HeaderSeparator />
      </Show>
      <Show when={props.running}>
        <ActivityRing size={16} />
      </Show>
      <Show when={props.title}>
        <SessionTitle title={props.title ?? ""} />
      </Show>
    </div>
  );
}

/** The session menu listing rename, export and delete. */
function SessionMenu(props: { actions: SessionHeaderAction[] }) {
  const tr = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={tr("sessionHeaderSessionMenu")}
        class="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
      >
        <MoreHorizontal class="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} class="w-max min-w-0">
        <For each={props.actions}>
          {(action) => (
            <div>
              <Show when={action.separated}>
                <DropdownMenuSeparator />
              </Show>
              <DropdownMenuItem
                onSelect={action.onSelect}
                class={`pe-[30px] ${action.danger ? "text-state-fg-danger focus:text-state-fg-danger" : ""}`}
              >
                {action.label}
              </DropdownMenuItem>
            </div>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The review toggle: a pane glyph whose filled half scales with the panel's
 * open width, so the icon reports the panel state while it animates.
 */
export function SessionPanelToggle(props: {
  open: boolean;
  onToggle: () => void;
  keybind?: string;
  class?: string;
}) {
  const tr = useT();
  const parts = createMemo(() => (props.keybind ? formatKeybind(props.keybind)?.split("+") ?? [] : []));
  const label = () => (props.open ? tr("hideReviewPanel") : tr("showReviewPanel"));

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label()}
        aria-expanded={props.open}
        aria-controls="review-panel"
        onClick={props.onToggle}
        class={`interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base ${props.class ?? ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="size-4">
          <g transform="matrix(-1 0 0 1 20 0)">
            <path
              d="M2.917 2.916H7.917V17.083H2.917Z"
              fill="currentColor"
              style={{
                transform: `matrix(${props.open ? 1 : 0} 0 0 1 ${props.open ? 0 : 2.917 * (1 - 0)} 0)`,
                "transform-origin": "left center",
                transition: "transform 160ms ease",
              }}
            />
            <path
              d="M2.917 2.916H17.084V17.083H2.917ZM7.917 2.916V17.083"
              stroke="currentColor"
              stroke-linecap="square"
            />
          </g>
        </svg>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span class="flex items-center gap-1.5">
          {label()}
          <Show when={parts().length > 0}>
            <Keybind keys={parts()} />
          </Show>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** The identity row at the top of a session panel: project, working ring, title and actions. */
export function SessionHeader(props: Props) {
  const ancestors = () => props.ancestors ?? [];
  const actions = () => props.actions ?? [];
  const endInset = () => props.endInset ?? 12;

  return (
    <div
      class="flex h-12 shrink-0 items-center gap-1.5 ps-2.5"
      style={{ "padding-inline-end": `${endInset()}px` }}
    >
      <SessionBreadcrumb
        workspace={props.workspace}
        workspaceIcon={props.workspaceIcon}
        workspaceColor={props.workspaceColor}
        worktree={props.worktree}
        directory={props.directory}
        title={props.title}
        ancestors={ancestors()}
        running={props.running}
        onOpenProjectSettings={props.onOpenProjectSettings}
        onOpenProjectHome={props.onOpenProjectHome}
        onOpenSession={props.onOpenSession}
      />

      <div class="flex shrink-0 items-center gap-2">
        <Show when={actions().length > 0}>
          <SessionMenu actions={actions()} />
        </Show>
        <Show when={props.context}>
          {(context) => <SessionContextButton {...context()} />}
        </Show>
        {props.summary}
        <Show when={props.reserveEnd}>
          <div class="size-7 shrink-0" aria-hidden="true" />
        </Show>
      </div>
    </div>
  );
}
