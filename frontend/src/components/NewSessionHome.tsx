import { Composer } from "./Composer";
import { Button } from "@/components/ui/button";
import type { ProviderSettings, UsageTotals, WorkspaceSelection } from "../lib/types";

interface Props {
  workspaceName?: string;
  connected: boolean;
  providers: ProviderSettings[];
  provider: string;
  model: string;
  workspaceDefault?: WorkspaceSelection;
  window: number;
  usage?: UsageTotals;
  onSelectModel: (providerID: string, modelID: string) => void;
  onToggleWorkspaceDefault: () => void;
  onSend: (text: string) => void;
  onAddWorkspace: () => void;
}

/**
 * Home / new-session view: a wordmark above one
 * composer, with no transcript and no session chrome.
 */
export function NewSessionHome({
  workspaceName,
  connected,
  providers,
  provider,
  model,
  workspaceDefault,
  window,
  usage,
  onSelectModel,
  onToggleWorkspaceDefault,
  onSend,
  onAddWorkspace,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
      <div className="w-full max-w-session px-3 py-16">
        <div className="mb-7 text-center select-none">
          <h1 className="text-[30px] font-[640] tracking-tight text-text-base">lingzhu</h1>
          <p className="mt-1 text-body text-text-faint">
            {workspaceName ? `Ask anything in ${workspaceName}` : "Add a workspace to start"}
          </p>
        </div>
        <Composer
          running={false}
          disabled={!connected}
          tokens={0}
          window={window}
          usage={usage}
          providers={providers}
          provider={provider}
          model={model}
          workspaceDefault={workspaceDefault}
          onSelectModel={onSelectModel}
          onToggleWorkspaceDefault={onToggleWorkspaceDefault}
          onSend={onSend}
          onStop={() => undefined}
        />
        {!workspaceName && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={onAddWorkspace}>
              Add workspace
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
