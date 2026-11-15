import { useState } from "react";
import { ChevronDown, FolderPlus, Monitor } from "@lingzhu/ui/icons";
import { Composer } from "./Composer";
import { ProjectAvatar } from "./ProjectAvatar";
import { SessionLocationDialog } from "./SessionLocationDialog";
import { Wordmark } from "./Wordmark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { useT } from "@lingzhu/ui/i18n";
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
export function NewSessionHome({
  workspaceName,
  workspacePath,
  workspaces = [],
  connected,
  providers,
  provider,
  model,
  commands,
  agents,
  agent,
  onSelectAgent,
  onSelectModel,
  onManageModels,
  onAddProvider,
  onSend,
  onShell,
  onAddWorkspace,
  onSelectWorkspace,
  onSelectWorktree,
  onOpenWorktrees,
}: Props) {
  const tr = useT();
  const [locationStep, setLocationStep] = useState<"projects" | "worktrees" | null>(null);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-[25.375%] flex justify-center px-6">
        <div className="pointer-events-auto w-full max-w-[880px]">
          <div className="mx-auto w-full max-w-[720px] select-none">
            <div className="relative mx-auto flex w-4/5 items-center justify-center">
              <Wordmark />
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Composer
                width="full"
                running={false}
                disabled={!connected}
                providers={providers}
                provider={provider}
                model={model}
                commands={commands}
                agents={agents}
                agent={agent}
                workspace={workspacePath}
                onSelectAgent={onSelectAgent}
                onSelectModel={onSelectModel}
                onManageModels={onManageModels}
                onAddProvider={onAddProvider}
                onSend={onSend}
                onStop={() => undefined}
                onShell={onShell}
              />

              <div className="relative flex min-h-9 min-w-0 items-center gap-3 ps-2 pe-1.5 text-[13px] leading-4 font-[440] tracking-[-0.04px]">
                {workspaceName ? (
                  <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-0 gap-y-1 py-1.5">
                    <div className="flex min-w-0 max-w-full items-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-label={`Session location: ${workspaceName}`}
                            onClick={() => setLocationStep("projects")}
                            className="interactive flex h-7 min-w-0 items-center gap-1.5 rounded-sm ps-1.5 pe-2 text-text-muted hover:text-text-base"
                          >
                            <ProjectAvatar name={workspaceName} />
                            <span className="min-w-0 truncate">{workspaceName}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Choose project</TooltipContent>
                      </Tooltip>
                      <span
                        className="mx-[1.5px] shrink-0 font-normal text-icon-faint"
                        aria-hidden="true"
                      >
                        /
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-label={tr("newSessionHomeSessionWorktreeLocal")}
                            onClick={() => setLocationStep("worktrees")}
                            className="interactive flex h-7 min-w-12 shrink-[1000] items-center gap-1.5 rounded-sm ps-1.5 pe-2 text-text-faint hover:text-text-base"
                          >
                            <Monitor className="size-3.5 shrink-0" />
                            <span className="min-w-0 truncate">Local</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Choose worktree</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onAddWorkspace}
                    className="flex h-7 min-w-0 max-w-[160px] items-center gap-1.5 rounded-sm px-2 text-[13px] leading-5 font-[440] tracking-[-0.04px] text-text-faint transition-colors hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
                  >
                    <FolderPlus className="size-4 shrink-0 text-text-faint" />
                    <span className="min-w-0 truncate leading-5">Add workspace</span>
                    <ChevronDown className="size-4 shrink-0 text-text-faint" />
                  </button>
                )}
                {workspacePath && (
                  <div className="flex min-w-0 flex-1 justify-end pe-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="min-w-0 cursor-text overflow-hidden whitespace-nowrap text-text-faint select-text"
                          dir="ltr"
                        >
                          {workspacePath}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[calc(100vw-32px)] break-all">
                        {workspacePath}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SessionLocationDialog
        open={locationStep !== null}
        step={locationStep ?? "projects"}
        workspacePath={workspacePath}
        workspaces={workspaces}
        onOpenChange={(open) => {
          if (!open) setLocationStep(null);
        }}
        onStepChange={setLocationStep}
        onSelectWorkspace={onSelectWorkspace}
        onSelectWorktree={onSelectWorktree}
        onAddWorkspace={onAddWorkspace}
        onOpenWorktrees={onOpenWorktrees}
      />
    </div>
  );
}
