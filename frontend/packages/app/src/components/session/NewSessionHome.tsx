import { Show, createSignal } from "solid-js";
import { ChevronDown, FolderPlus, Monitor } from "@lingzhu/ui/icons";
import { Composer } from "./Composer";
import { ProjectAvatar } from "../workspace/ProjectAvatar";
import { SessionLocationDialog } from "../dialogs/SessionLocationDialog";
import { Wordmark } from "../shell/Wordmark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { useT } from "@lingzhu/ui/i18n";
import { api } from "../../lib/api";
import { notify } from "../../app/useApp";
import type {
  AgentProfile,
  PromptAttachment,
  PromptReference,
  ProviderSettings,
  SlashCommand,
  WorkspaceInfo,
} from "@lingzhu/ui/types";

interface Props {
  workspaceName?: string;
  workspacePath?: string;
  workspaces?: WorkspaceInfo[];
  connected: boolean;
  providers: ProviderSettings[];
  provider: string;
  model: string;
  commands: SlashCommand[];
  agents?: AgentProfile[];
  agent?: string;
  onSelectAgent?: (agentID: string) => void;
  onSelectModel: (providerID: string, modelID: string) => void;
  onManageModels: () => void;
  onAddProvider: () => void;
  onSend: (text: string, delivery: 'steer' | 'queue', attachments: PromptAttachment[], references?: PromptReference[]) => void;
  onShell?: () => void;
  onAddWorkspace: () => void;
  onSelectWorkspace?: (path: string) => void;
  /** Opens a git worktree as the session location, adding it as a workspace if needed. */
  onSelectWorktree?: (path: string) => void;
  /** Opens the existing worktree manager for the current project. */
  onOpenWorktrees?: () => void;
}

/**
 * New session surface: the wordmark and one composer float over the session
 * panel, with the project/worktree tray directly beneath the card, like the
 * reference new-session screen.
 */
export function NewSessionHome(props: Props) {
  const tr = useT();
  const [locationStep, setLocationStep] = createSignal<"projects" | "worktrees" | null>(null);

  const revealWorkspace = async () => {
    if (!props.workspacePath) return;
    try {
      await api.revealPath(props.workspacePath);
    } catch {
      notify(tr("revealFailed"));
    }
  };

  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="pointer-events-none absolute inset-x-0 top-[25.375%] flex justify-center px-6">
        <div class="pointer-events-auto w-full max-w-[880px]">
          <div class="mx-auto w-full max-w-[720px] select-none">
            <div class="relative mx-auto flex w-4/5 items-center justify-center">
              <Wordmark />
            </div>
          </div>
          <div class="mt-8 flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <Composer
                width="full"
                running={false}
                disabled={!props.connected}
                providers={props.providers}
                provider={props.provider}
                model={props.model}
                commands={props.commands}
                agents={props.agents}
                agent={props.agent}
                workspace={props.workspacePath}
                onSelectAgent={props.onSelectAgent}
                onSelectModel={props.onSelectModel}
                onManageModels={props.onManageModels}
                onAddProvider={props.onAddProvider}
                onSend={props.onSend}
                onStop={() => undefined}
                onShell={props.onShell}
              />

              <div class="relative flex min-h-9 min-w-0 items-center gap-3 ps-2 pe-1.5 text-[13px] leading-4 font-[440] tracking-[-0.04px]">
                <Show
                  when={props.workspaceName}
                  fallback={
                    <button
                      type="button"
                      onClick={props.onAddWorkspace}
                      class="flex h-7 min-w-0 max-w-[160px] items-center gap-1.5 rounded-sm px-2 text-[13px] leading-5 font-[440] tracking-[-0.04px] text-text-faint transition-colors hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
                    >
                      <FolderPlus class="size-4 shrink-0 text-text-faint" />
                      <span class="min-w-0 truncate leading-5">Add workspace</span>
                      <ChevronDown class="size-4 shrink-0 text-text-faint" />
                    </button>
                  }
                >
                  {(workspaceName) => (
                    <div class="flex min-w-0 max-w-full flex-wrap items-center gap-x-0 gap-y-1 py-1.5">
                      <div class="flex min-w-0 max-w-full items-center">
                        <Tooltip>
                          <TooltipTrigger
                            type="button"
                            aria-haspopup="dialog"
                            aria-label={`Session location: ${workspaceName()}`}
                            onClick={() => setLocationStep("projects")}
                            class="interactive flex h-7 min-w-0 items-center gap-1.5 rounded-sm ps-1.5 pe-2 text-text-muted hover:text-text-base"
                          >
                            <ProjectAvatar name={workspaceName()} />
                            <span class="min-w-0 truncate">{workspaceName()}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">Choose project</TooltipContent>
                        </Tooltip>
                        <span class="mx-[1.5px] shrink-0 font-normal text-icon-faint" aria-hidden="true">
                          /
                        </span>
                        <Tooltip>
                          <TooltipTrigger
                            type="button"
                            aria-haspopup="dialog"
                            aria-label={tr("newSessionHomeSessionWorktreeLocal")}
                            onClick={() => setLocationStep("worktrees")}
                            class="interactive flex h-7 min-w-12 shrink-[1000] items-center gap-1.5 rounded-sm ps-1.5 pe-2 text-text-faint hover:text-text-base"
                          >
                            <Monitor class="size-3.5 shrink-0" />
                            <span class="min-w-0 truncate">Local</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">Choose worktree</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </Show>
                <Show when={props.workspacePath}>
                  {(workspacePath) => (
                    <div class="flex min-w-0 flex-1 justify-end pe-1.5">
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          aria-label={`${tr("openInFileManager")}: ${workspacePath()}`}
                          onClick={(event) => {
                            event.preventDefault();
                            void revealWorkspace();
                          }}
                          class="interactive min-w-0 cursor-pointer overflow-hidden whitespace-nowrap rounded-sm text-left text-text-faint hover:text-text-base"
                          dir="ltr"
                        >
                          {workspacePath()}
                        </TooltipTrigger>
                        <TooltipContent side="top" class="max-w-[calc(100vw-32px)] break-all">
                          {workspacePath()}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SessionLocationDialog
        open={locationStep() !== null}
        step={locationStep() ?? "projects"}
        workspacePath={props.workspacePath}
        workspaces={props.workspaces ?? []}
        onOpenChange={(open) => {
          if (!open) setLocationStep(null);
        }}
        onStepChange={setLocationStep}
        onSelectWorkspace={props.onSelectWorkspace}
        onSelectWorktree={props.onSelectWorktree}
        onAddWorkspace={props.onAddWorkspace}
        onOpenWorktrees={props.onOpenWorktrees}
      />
    </div>
  );
}
