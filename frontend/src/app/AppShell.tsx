import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Composer } from "../components/Composer";
import { ConfirmDialog, RenameDialog } from "../components/Dialogs";
import { ManageModelsDialog } from "../components/ManageModelsDialog";
import { Messages } from "../components/Messages";
import { NewSessionHome } from "../components/NewSessionHome";
import { PermissionCard } from "../components/PermissionCard";
import { Sidebar, type SessionSelection } from "../components/Sidebar";
import { SettingsPage } from "../components/settings/SettingsPage";
import { TabBar, type AppTab } from "../components/TabBar";
import { TitleBar } from "../components/TitleBar";
import { workspaceName } from "../lib/history";
import type { SessionInfo } from "../lib/types";
import { useCatalog, useCatalogStore } from "../store/catalog";
import {
  useActiveChat,
  useActiveChatID,
  useAnyChatRunning,
  useAtHome,
  useChatHome,
  useChatMap,
  useChatStore,
} from "../store/chat";
import { notify } from "../store/notify";
import { usePreferences, usePreferencesStore } from "../store/preferences";
import { useViewStore } from "../store/view";
import {
  useActivePath,
  useSessionsByWorkspace,
  useWorkspaceStore,
  useWorkspaces,
} from "../store/workspaces";

/**
 * The window layout: sidebar, tab strip, chat or settings pane, and the
 * confirm dialogs. It reads stores directly; every mutation lives in the
 * store that owns the state.
 */
export function AppShell() {
  const preferences = usePreferences();
  const savePreferences = usePreferencesStore((state) => state.save);
  const catalog = useCatalog();
  const reloadCatalog = useCatalogStore((state) => state.reload);

  const view = useViewStore(
    useShallow((state) => ({
      tab: state.tab,
      settingsOpen: state.settingsOpen,
      settingsSection: state.settingsSection,
      select: state.select,
      showChat: state.showChat,
      openSettings: state.openSettings,
      selectSettingsSection: state.selectSettingsSection,
      closeSettings: state.closeSettings,
    })),
  );

  const workspaceList = useWorkspaces();
  const activePath = useActivePath();
  const sessionsByWorkspace = useSessionsByWorkspace();
  const workspaceActions = useWorkspaceStore(
    useShallow((state) => ({
      select: state.select,
      loadSessions: state.loadSessions,
      connect: state.connect,
      disconnect: state.disconnect,
      renameSession: state.renameSession,
      deleteSession: state.deleteSession,
      deleteSessions: state.deleteSessions,
    })),
  );

  const chats = useChatMap();
  const activeId = useActiveChatID();
  const active = useActiveChat();
  const atHome = useAtHome();
  const running = useAnyChatRunning();
  const home = useChatHome();
  const chatActions = useChatStore(
    useShallow((state) => ({
      open: state.open,
      newChat: state.newChat,
      send: state.send,
      startSession: state.startSession,
      stop: state.stop,
      selectModel: state.selectModel,
      reply: state.reply,
      discard: state.discard,
    })),
  );

  const [renameTarget, setRenameTarget] = useState<{ workspace: string; session: SessionInfo }>();
  const [deleteTarget, setDeleteTarget] = useState<{ workspace: string; session: SessionInfo }>();
  const [removeWorkspaceTarget, setRemoveWorkspaceTarget] = useState<string>();
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<SessionSelection[]>();
  const [manageModels, setManageModels] = useState<{ connect: boolean }>();
  // Bumped once a bulk delete settles so the sidebar can leave selection mode.
  const [selectionReset, setSelectionReset] = useState(0);

  const activeWorkspace = workspaceList.find((workspace) => workspace.path === activePath);
  const homeWorkspace = activeWorkspace ?? workspaceList.find((workspace) => workspace.path === home.path);
  const providers = catalog?.providers ?? [];

  const confirmRename = async (title: string) => {
    const target = renameTarget;
    if (!target) return;
    setRenameTarget(undefined);
    await workspaceActions.renameSession(target.workspace, target.session.id, title);
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(undefined);
    if (await workspaceActions.deleteSession(target.workspace, target.session.id)) {
      chatActions.discard(target.workspace, target.session.id);
    }
  };

  const confirmRemoveWorkspace = async () => {
    const path = removeWorkspaceTarget;
    if (!path) return;
    setRemoveWorkspaceTarget(undefined);
    await workspaceActions.disconnect(path);
  };

  const confirmBulkDelete = async () => {
    const items = bulkDeleteTarget;
    if (!items) return;
    setBulkDeleteTarget(undefined);
    const byWorkspace = new Map<string, string[]>();
    for (const item of items) {
      const ids = byWorkspace.get(item.path) ?? [];
      ids.push(item.id);
      byWorkspace.set(item.path, ids);
    }
    await Promise.all(
      [...byWorkspace].map(async ([path, ids]) => {
        const deleted = await workspaceActions.deleteSessions(path, ids);
        for (const id of deleted) chatActions.discard(path, id);
      }),
    );
    setSelectionReset((value) => value + 1);
  };

  const settingsSaved = async (reused: string[]) => {
    await Promise.all([useWorkspaceStore.getState().refresh(), reloadCatalog()]);
    if (reused.length > 0) {
      notify(`Settings saved. Restart the shared core for ${reused.join(", ")} to apply.`, "info");
    }
  };

  // The model picker manages the catalog in place, like the reference dialog;
  // a hidden settings page would keep a stale draft, so close it first.
  const openManageModels = (connect: boolean) => {
    if (view.settingsOpen) view.closeSettings();
    setManageModels({ connect });
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
          workspaces={workspaceList}
          activePath={activePath}
          sessionsByWorkspace={sessionsByWorkspace}
          chats={chats}
          activeId={activeId}
          onSelectWorkspace={(path) => {
            view.showChat();
            workspaceActions.select(path);
          }}
          onLoadSessions={workspaceActions.loadSessions}
          onAddWorkspace={() => void workspaceActions.connect()}
          onRemoveWorkspace={setRemoveWorkspaceTarget}
          onNew={(path) => void chatActions.newChat(path)}
          onOpen={(path, id) => void chatActions.open(path, id)}
          onRename={(path, session) => setRenameTarget({ workspace: path, session })}
          onDelete={(path, session) => setDeleteTarget({ workspace: path, session })}
          onDeleteSelected={setBulkDeleteTarget}
          selectionReset={selectionReset}
          onOpenSettings={() => view.openSettings()}
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
              {active && !atHome ? (
                <>
                  <Messages chat={active} />
                  <PermissionCard
                    requests={active.pending}
                    onReply={(id, decision) => void chatActions.reply(id, decision)}
                  />
                  <Composer
                    running={active.running}
                    disabled={!activeWorkspace?.connected}
                    tokens={active.tokens}
                    window={active.window}
                    usage={active.usage}
                    providers={providers}
                    provider={active.provider ?? catalog?.provider ?? ""}
                    model={active.model ?? catalog?.model ?? ""}
                    onSelectModel={(providerID, modelID) => void chatActions.selectModel(providerID, modelID)}
                    onManageModels={() => openManageModels(false)}
                    onAddProvider={() => openManageModels(true)}
                    onSend={chatActions.send}
                    onStop={() => void chatActions.stop()}
                  />
                </>
              ) : (
                <NewSessionHome
                  workspaceName={homeWorkspace?.name}
                  connected={homeWorkspace?.connected ?? false}
                  providers={providers}
                  provider={home.provider}
                  model={home.model}
                  window={home.window}
                  onSelectModel={(providerID, modelID) => void chatActions.selectModel(providerID, modelID)}
                  onManageModels={() => openManageModels(false)}
                  onAddProvider={() => openManageModels(true)}
                  onSend={chatActions.startSession}
                  onAddWorkspace={() => void workspaceActions.connect()}
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
                  busy={running}
                  section={view.settingsSection}
                  onSectionChange={view.selectSettingsSection}
                  workspaces={workspaceList}
                  preferences={preferences}
                  onSavePreferences={savePreferences}
                  onSaved={(reused) => void settingsSaved(reused)}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {manageModels && (
        <ManageModelsDialog
          open
          busy={running}
          initialConnect={manageModels.connect}
          onOpenChange={(next) => {
            if (!next) setManageModels(undefined);
          }}
          onSaved={(reused) => void settingsSaved(reused)}
        />
      )}

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
        open={bulkDeleteTarget !== undefined}
        title="Delete sessions"
        description={`Delete ${bulkDeleteTarget?.length ?? 0} session${
          bulkDeleteTarget?.length === 1 ? "" : "s"
        }? ${bulkDeleteTarget?.length === 1 ? "Its log is" : "Their logs are"} removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={(open) => {
          if (!open) setBulkDeleteTarget(undefined);
        }}
        onConfirm={() => void confirmBulkDelete()}
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
