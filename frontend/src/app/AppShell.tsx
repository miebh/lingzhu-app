import { useState } from "react";
import { Composer } from "../components/Composer";
import { ConfirmDialog, RenameDialog } from "../components/Dialogs";
import { Messages } from "../components/Messages";
import { NewSessionHome } from "../components/NewSessionHome";
import { PermissionCard } from "../components/PermissionCard";
import { Sidebar } from "../components/Sidebar";
import { SettingsPage } from "../components/settings/SettingsPage";
import { TabBar, type AppTab } from "../components/TabBar";
import { TitleBar } from "../components/TitleBar";
import { workspaceName } from "../lib/history";
import type { SessionInfo } from "../lib/types";
import { useCatalog } from "./CatalogProvider";
import { useChats } from "./ChatProvider";
import { useNotify } from "./NotifyProvider";
import { usePreferences } from "./PreferencesProvider";
import { useView } from "./ViewProvider";
import { useWorkspaces } from "./WorkspaceProvider";

/**
 * The window layout: sidebar, tab strip, chat or settings pane, and the
 * confirm dialogs. It only wires providers to components; every mutation
 * lives in the provider that owns the state.
 */
export function AppShell() {
  const notify = useNotify();
  const preferences = usePreferences();
  const catalog = useCatalog();
  const view = useView();
  const workspaces = useWorkspaces();
  const chats = useChats();

  const [renameTarget, setRenameTarget] = useState<{ workspace: string; session: SessionInfo }>();
  const [deleteTarget, setDeleteTarget] = useState<{ workspace: string; session: SessionInfo }>();
  const [removeWorkspaceTarget, setRemoveWorkspaceTarget] = useState<string>();

  const active = chats.active;
  const activeWorkspace = workspaces.activeWorkspace;
  const homeWorkspace = activeWorkspace ?? workspaces.workspaces.find((workspace) => workspace.path === chats.home.path);
  const providers = catalog.catalog?.providers ?? [];

  const confirmRename = async (title: string) => {
    const target = renameTarget;
    if (!target) return;
    setRenameTarget(undefined);
    await workspaces.renameSession(target.workspace, target.session.id, title);
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(undefined);
    if (await workspaces.deleteSession(target.workspace, target.session.id)) {
      chats.discard(target.workspace, target.session.id);
    }
  };

  const confirmRemoveWorkspace = async () => {
    const path = removeWorkspaceTarget;
    if (!path) return;
    setRemoveWorkspaceTarget(undefined);
    await workspaces.disconnect(path);
  };

  const settingsSaved = async (reused: string[]) => {
    await Promise.all([workspaces.refresh(), catalog.reload()]);
    if (reused.length > 0) {
      notify(`Settings saved. Restart the shared core for ${reused.join(", ")} to apply.`, "info");
    }
  };

  const chatStatus: AppTab["status"] =
    active && active.pending.length > 0 ? "warning" : active?.running ? "ongoing" : undefined;
  const tabs: AppTab[] = [
    { id: "chat", label: active ? active.title || "New session" : "Chat", status: chatStatus },
    ...(view.settingsOpen ? [{ id: "settings" as const, label: "Settings", closable: true }] : []),
  ];

  return (
    <div className="flex h-full flex-col bg-bg-base text-text-base">
      <TitleBar
        workspace={view.tab === "settings" ? undefined : activeWorkspace?.name}
        title={view.tab === "settings" ? "Settings" : active ? active.title || "New session" : undefined}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          workspaces={workspaces.workspaces}
          activePath={workspaces.activePath}
          sessionsByWorkspace={workspaces.sessionsByWorkspace}
          chats={chats.chats}
          activeId={chats.activeId}
          onSelectWorkspace={(path) => {
            view.showChat();
            workspaces.select(path);
          }}
          onLoadSessions={workspaces.loadSessions}
          onAddWorkspace={() => void workspaces.connect()}
          onRemoveWorkspace={setRemoveWorkspaceTarget}
          onNew={(path) => void chats.newChat(path)}
          onOpen={(path, id) => void chats.open(path, id)}
          onRename={(path, session) => setRenameTarget({ workspace: path, session })}
          onDelete={(path, session) => setDeleteTarget({ workspace: path, session })}
          onOpenSettings={view.openSettings}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {view.settingsOpen && (
            <TabBar tabs={tabs} active={view.tab} onSelect={view.select} onClose={() => view.closeSettings()} />
          )}

          <div className="relative flex min-h-0 flex-1">
            <div
              inert={view.tab === "settings" ? true : undefined}
              aria-hidden={view.tab === "settings" ? true : undefined}
              className={`flex min-h-0 flex-1 flex-col ${view.tab === "settings" ? "invisible" : ""}`}
            >
              {active && !chats.atHome ? (
                <>
                  <Messages chat={active} />
                  <PermissionCard requests={active.pending} onReply={(id, decision) => void chats.reply(id, decision)} />
                  <Composer
                    running={active.running}
                    disabled={!activeWorkspace?.connected}
                    tokens={active.tokens}
                    window={active.window}
                    usage={active.usage}
                    providers={providers}
                    provider={active.provider ?? catalog.catalog?.provider ?? ""}
                    model={active.model ?? catalog.catalog?.model ?? ""}
                    workspaceDefault={
                      workspaces.activePath ? preferences.preferences.workspaceModels[workspaces.activePath] : undefined
                    }
                    onSelectModel={(providerID, modelID) => void chats.selectModel(providerID, modelID)}
                    onToggleWorkspaceDefault={chats.toggleWorkspaceDefault}
                    onSend={chats.send}
                    onStop={() => void chats.stop()}
                  />
                </>
              ) : (
                <NewSessionHome
                  workspaceName={homeWorkspace?.name}
                  connected={homeWorkspace?.connected ?? false}
                  providers={providers}
                  provider={chats.home.provider}
                  model={chats.home.model}
                  workspaceDefault={
                    chats.home.path ? preferences.preferences.workspaceModels[chats.home.path] : undefined
                  }
                  window={chats.home.window}
                  onSelectModel={(providerID, modelID) => void chats.selectModel(providerID, modelID)}
                  onToggleWorkspaceDefault={chats.toggleWorkspaceDefault}
                  onSend={chats.startSession}
                  onAddWorkspace={() => void workspaces.connect()}
                />
              )}
            </div>

            {view.settingsOpen && (
              <div
                className={`absolute inset-0 z-10 flex min-h-0 flex-col bg-bg-base ${
                  view.tab === "settings" ? "" : "invisible"
                }`}
              >
                <SettingsPage
                  busy={chats.running}
                  workspaces={workspaces.workspaces}
                  preferences={preferences.preferences}
                  onSavePreferences={preferences.save}
                  onSaved={(reused) => void settingsSaved(reused)}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      <RenameDialog
        open={renameTarget !== undefined}
        initial={renameTarget?.session.title ?? ""}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(undefined);
        }}
        onConfirm={(title) => void confirmRename(title)}
      />

      <ConfirmDialog
        open={deleteTarget !== undefined}
        title="Delete session"
        description={`Delete "${deleteTarget?.session.title || deleteTarget?.session.id || "this session"}"? Its log is removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        onConfirm={() => void confirmDelete()}
      />

      <ConfirmDialog
        open={removeWorkspaceTarget !== undefined}
        title="Remove workspace"
        description={`Remove "${removeWorkspaceTarget ? workspaceName(removeWorkspaceTarget) : ""}" from the sidebar? Session data stays on disk.`}
        confirmLabel="Remove"
        destructive
        onOpenChange={(open) => {
          if (!open) setRemoveWorkspaceTarget(undefined);
        }}
        onConfirm={() => void confirmRemoveWorkspace()}
      />
    </div>
  );
}
