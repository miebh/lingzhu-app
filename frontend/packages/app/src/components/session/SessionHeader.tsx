import { Fragment, type ReactNode } from "react";
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
  summary?: ReactNode;
}

/** A slash separating two segments of the breadcrumb. */
function HeaderSeparator() {
  return (
    <span className="shrink-0 text-[13px] leading-4 text-icon-faint" aria-hidden="true">
      /
    </span>
  );
}

/** One clickable ancestor session in the breadcrumb. */
function SessionAncestorLink({
  id,
  title,
  last,
  onOpenSession,
}: {
  id: string;
  title: string;
  last: boolean;
  onOpenSession?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-slot={last ? "session-title-parent" : "session-title-ancestor"}
      data-session-id={id}
      title={title}
      onClick={() => onOpenSession?.(id)}
      className="max-w-[min(200px,40vw)] shrink-0 truncate px-1 text-[13px] leading-4 font-[530] tracking-[-0.04px] text-text-faint transition-colors hover:text-text-muted"
    >
      <bdi dir="auto">{title}</bdi>
    </button>
  );
}

/** The title of the session this header belongs to. */
function SessionTitle({ title }: { title: string }) {
  return (
    <h1 className="w-fit min-w-0 max-w-full shrink truncate rounded-md px-1 py-1.5 text-[13px] leading-4 font-[530] tracking-[-0.04px] text-text-base">
      {title}
    </h1>
  );
}

/** The breadcrumb: project location, ancestor sessions and the title. */
function SessionBreadcrumb({
  workspace,
  workspaceIcon,
  workspaceColor,
  worktree,
  directory,
  title,
  ancestors,
  running,
  onOpenProjectSettings,
  onOpenProjectHome,
  onOpenSession,
}: {
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
  const location = [workspace, ancestors.length > 0 ? "" : worktree].filter(Boolean).join(" / ");
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <SessionLocationMenu
        workspace={workspace}
        workspaceIcon={workspaceIcon}
        workspaceColor={workspaceColor}
        directory={directory}
        worktree={ancestors.length > 0 ? undefined : worktree}
        label={location}
        onOpenProject={onOpenProjectHome}
        onOpenSettings={onOpenProjectSettings}
      />
      {ancestors.map((ancestor, index) => (
        <Fragment key={ancestor.id}>
          <HeaderSeparator />
          <SessionAncestorLink
            id={ancestor.id}
            title={ancestor.title}
            last={index === ancestors.length - 1}
            onOpenSession={onOpenSession}
          />
        </Fragment>
      ))}
      {workspace && (title || ancestors.length > 0) && <HeaderSeparator />}
      {running && <ActivityRing size={16} />}
      {title && <SessionTitle title={title} />}
    </div>
  );
}

/** The session menu listing rename, export and delete. */
function SessionMenu({ actions }: { actions: SessionHeaderAction[] }) {
  const tr = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={tr("sessionHeaderSessionMenu")}
          className="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-max min-w-0">
        {actions.map((action) => (
          <div key={action.id}>
            {action.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onSelect={action.onSelect}
              className={`pe-[30px] ${action.danger ? "text-state-fg-danger focus:text-state-fg-danger" : ""}`}
            >
              {action.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The review toggle: a pane glyph whose filled half scales with the panel's
 * open width, so the icon reports the panel state while it animates.
 */
export function SessionPanelToggle({
  open,
  onToggle,
  keybind,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  keybind?: string;
  className?: string;
}) {
  const tr = useT();
  const parts = keybind ? formatKeybind(keybind)?.split("+") ?? [] : [];
  const label = open ? tr("hideReviewPanel") : tr("showReviewPanel");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-controls="review-panel"
          onClick={onToggle}
          className={`interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base ${className ?? ""}`}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
            <g transform="matrix(-1 0 0 1 20 0)">
              <path
                d="M2.917 2.916H7.917V17.083H2.917Z"
                fill="currentColor"
                style={{
                  transform: `matrix(${open ? 1 : 0} 0 0 1 ${open ? 0 : 2.917 * (1 - 0)} 0)`,
                  transformOrigin: "left center",
                  transition: "transform 160ms ease",
                }}
              />
              <path
                d="M2.917 2.916H17.084V17.083H2.917ZM7.917 2.916V17.083"
                stroke="currentColor"
                strokeLinecap="square"
              />
            </g>
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="flex items-center gap-1.5">
          {label}
          {parts.length > 0 && <Keybind keys={parts} />}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** The identity row at the top of a session panel: project, working ring, title and actions. */
export function SessionHeader({
  workspace,
  workspaceIcon,
  workspaceColor,
  worktree,
  directory,
  title,
  ancestors = [],
  running,
  onOpenProjectSettings,
  onOpenProjectHome,
  onOpenSession,
  actions = [],
  context,
  /** Reserves the trailing slot the floating review toggle occupies. */
  reserveEnd,
  endInset = 12,
  summary,
}: Props) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 ps-2.5" style={{ paddingInlineEnd: endInset }}>
      <SessionBreadcrumb
        workspace={workspace}
        workspaceIcon={workspaceIcon}
        workspaceColor={workspaceColor}
        worktree={worktree}
        directory={directory}
        title={title}
        ancestors={ancestors}
        running={running}
        onOpenProjectSettings={onOpenProjectSettings}
        onOpenProjectHome={onOpenProjectHome}
        onOpenSession={onOpenSession}
      />

      <div className="flex shrink-0 items-center gap-2">
        {actions.length > 0 && <SessionMenu actions={actions} />}
        {context && <SessionContextButton {...context} />}
        {summary}
        {reserveEnd && <div className="size-7 shrink-0" aria-hidden="true" />}
      </div>
    </div>
  );
}
