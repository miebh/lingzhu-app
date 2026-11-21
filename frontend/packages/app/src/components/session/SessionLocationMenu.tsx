import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { Tooltip as TooltipPrimitive } from "@kobalte/core/tooltip";
import {
  Copy,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Monitor,
  Settings2,
  Worktree,
} from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Tooltip, TooltipContent } from "@lingzhu/ui/tooltip";
import { api } from "../../lib/api";
import { t, type MessageKey } from "@lingzhu/ui/i18n";
import { notify } from "../../app/useApp";
import type { VCSInfo } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../workspace/ProjectAvatar";

interface Props {
  /** Project display name. */
  workspace?: string;
  /** Project avatar artwork and color keys. */
  workspaceIcon?: string;
  workspaceColor?: string;
  /** Directory the session runs in. */
  directory?: string;
  /** Worktree checkout path when the session runs outside the project root. */
  worktree?: string;
  /** Trigger label: project and worktree, joined with a slash. */
  label?: string;
  onOpenProject?: () => void;
  onOpenSettings?: () => void;
}

function revealKey(): MessageKey {
  const platform = navigator.userAgent;
  if (/Mac/i.test(platform)) return "revealInFinder";
  if (/Win/i.test(platform)) return "revealInFileExplorer";
  return "openInFileManager";
}

function baseName(path: string) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(index + 1) || path;
}

function splitPath(path: string) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (index < 0) return ["", path];
  return [path.slice(0, index), path.slice(index)];
}

/** The location card behind the session header's project trigger. */
export function SessionLocationMenu(props: Props) {
  const [vcs, setVcs] = createSignal<VCSInfo | null>(null);

  createEffect(() => {
    // A new directory starts from no branch until its info arrives.
    props.directory;
    setVcs(null);
  });

  const loadBranch = async () => {
    const directory = props.directory;
    if (!directory) return;
    try {
      setVcs(await api.vcsInfo(directory));
    } catch {
      setVcs(null);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(t("copiedToClipboard"), "info");
    } catch {
      notify(t("copyFailed"));
    }
  };

  const reveal = async (path: string) => {
    try {
      await api.revealPath(path);
    } catch {
      notify(t("revealFailed"));
    }
  };

  const branch = createMemo(() => vcs()?.branch?.current);
  const baseBranch = createMemo(() => vcs()?.branch?.default);
  const parts = createMemo(() => (props.directory ? splitPath(props.directory) : ["", ""]));
  const parentPath = () => parts()[0];
  const leafPath = () => parts()[1];

  return (
    <DropdownMenu onOpenChange={(open) => open && void loadBranch()}>
      <Tooltip>
        <TooltipPrimitive.Trigger as="span" class="flex min-w-0 max-w-full shrink">
          <DropdownMenuTrigger
            type="button"
            aria-label={props.label || t("project")}
            class="interactive flex h-7 min-w-0 max-w-full shrink items-center gap-2 overflow-hidden rounded-[6px] px-1.5 text-[13px] leading-4 tracking-[-0.04px] text-text-muted hover:text-text-base data-[state=open]:text-text-base"
          >
            <ProjectAvatar name={props.workspace} icon={props.workspaceIcon} color={props.workspaceColor} />
            <Show when={props.label}>
              <span class="min-w-0 max-w-44 shrink-0 truncate">{props.label}</span>
            </Show>
          </DropdownMenuTrigger>
        </TooltipPrimitive.Trigger>
        <TooltipContent side="bottom">{props.label || t("project")}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
        class="w-[320px] max-w-[calc(100vw-16px)]"
        aria-label={props.workspace}
      >
        <DropdownMenuItem class="min-w-0" disabled={!props.workspace} onSelect={props.onOpenProject}>
          <ProjectAvatar name={props.workspace} icon={props.workspaceIcon} color={props.workspaceColor} />
          <bdi dir="auto" class="min-w-0 truncate font-[530]">
            {props.workspace}
          </bdi>
        </DropdownMenuItem>

        <div class="flex h-7 min-w-0 items-center gap-2 rounded-xs px-3 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base">
          <Show
            when={props.worktree}
            fallback={<Monitor class="size-4 shrink-0 text-icon-base" aria-hidden="true" />}
          >
            <Worktree class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
          </Show>
          <span class="min-w-0 truncate">{props.worktree ? baseName(props.worktree) : t("localWorkspace")}</span>
        </div>

        <Show when={vcs() && branch()}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <GitBranch class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
              <bdi dir="auto" class="min-w-0 truncate">
                {branch()}
              </bdi>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="w-max min-w-[172px]">
              <DropdownMenuItem onSelect={() => void copy(branch() ?? "")}>
                <Copy class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                {t("copyBranch")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Show>

        <Show when={vcs() && !branch()}>
          <div class="flex h-7 min-w-0 items-center gap-2 rounded-xs px-3 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base">
            <GitBranch class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="shrink-0 whitespace-nowrap">{t("noBranch")}</span>
              <Show when={baseBranch()}>
                <span class="text-text-muted">·</span>
                <span class="truncate text-text-faint">
                  {t("basedOn", { branch: baseBranch() ?? "" })}
                </span>
              </Show>
            </span>
          </div>
        </Show>

        <Show when={props.directory}>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-slot="session-location-path" aria-label={props.directory}>
              <FolderOpen class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
              <bdi dir="ltr" class="flex min-w-0 select-text whitespace-nowrap">
                <span class="min-w-0 truncate">{parentPath()}</span>
                <span class="max-w-full shrink-0 truncate">{leafPath()}</span>
              </bdi>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="w-max max-w-[calc(100vw-32px)]">
              <DropdownMenuItem onSelect={() => void copy(props.directory ?? "")}>
                <Copy class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                {t("copyPath")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void reveal(props.directory ?? "")}>
                <ExternalLink class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                {t(revealKey())}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Show>

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!props.workspace} onSelect={props.onOpenSettings}>
          <Settings2 class="size-4 shrink-0 text-icon-base" aria-hidden="true" />
          {t("projectSettings")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
