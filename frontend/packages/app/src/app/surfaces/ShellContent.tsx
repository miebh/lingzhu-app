import { useEffect, useMemo, useState } from "react";
import { SessionHeader, SessionPanelToggle } from "../../components/SessionHeader";
import { api } from "../../lib/api";
import { contextUsage, modelCost, modelWindow } from "../../lib/contextUsage";
import { t } from "@lingzhu/ui/i18n";
import type { SessionLocation } from "@lingzhu/ui/types";
import { buildAncestors } from "../derive";
import { useActiveChatField, useAtHome } from "../hooks";
import { useShell } from "../ShellProvider";
import { ComposerDock } from "../features/chat/ComposerDock";
import { HomePane } from "../features/home/HomePane";
import { MessagesPane } from "../features/chat/MessagesPane";
import { NewSessionPane } from "../features/session/NewSessionPane";
import { SessionPanelPane } from "../features/session/SessionPanelPane";
import { SettingsPane } from "../features/settings/SettingsPane";

/** The main pane: session header plus the Home/chat/draft surface and panels. */
export function ShellContent() {
  const shell = useShell();
  const { view, activeWorkspace } = shell;
  // The header and dock only read a few session fields. Subscribing to the
  // whole chat would rebuild this container, the sticky header and the dock on
  // every streamed token.
  const activeId = useActiveChatField((chat) => chat.id, undefined);
  const activeTitle = useActiveChatField((chat) => chat.title, "");
  const activeDraft = useActiveChatField((chat) => Boolean(chat.draft), false);
  const activeRunning = useActiveChatField((chat) => chat.running, false);
  // The header ring reads its own fields; subscribing to the chat object would
  // rebuild this container, the sticky header and the dock on every token.
  const activeTokens = useActiveChatField((chat) => chat.tokens, 0);
  const activeUsage = useActiveChatField((chat) => chat.usage, undefined);
  const activeProvider = useActiveChatField((chat) => chat.provider, undefined);
  const activeModel = useActiveChatField((chat) => chat.model, undefined);
  const atHome = useAtHome();
  const [activeLocation, setActiveLocation] = useState<SessionLocation>();
  const [composerInset, setComposerInset] = useState(0);

  useEffect(() => {
    setActiveLocation(undefined);
    if (!activeId || !activeWorkspace || activeDraft) return;
    let cancelled = false;
    void api
      .location(activeWorkspace.path, activeId)
      .then((value) => {
        if (!cancelled) setActiveLocation(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeId, activeDraft, activeWorkspace?.path]);

  const activeAncestors = buildAncestors(activeLocation, shell.sessionsByWorkspace);
  // The catalog prices the model and states its context window, so the ring
  // follows a model switch without another request.
  const ringCost = useMemo(
    () => modelCost(shell.providers, activeProvider, activeModel),
    [activeProvider, activeModel, shell.providers],
  );
  const ringWindow = useMemo(
    () => modelWindow(shell.providers, activeProvider, activeModel),
    [activeProvider, activeModel, shell.providers],
  );
  const ringUsage = useMemo(
    () => contextUsage({ tokens: activeTokens, window: ringWindow, usage: activeUsage }, ringCost),
    [activeTokens, ringWindow, activeUsage, ringCost],
  );
  const sessionMenu = (() => {
    if (!activeId || !activeWorkspace) return [];
    const session = shell.sessionsByWorkspace[activeWorkspace.path]?.find((entry) => entry.id === activeId);
    if (!session) return [];
    return [
      { id: "rename", label: t("rename"), onSelect: () => shell.dialogs.setRenameTarget({ workspace: activeWorkspace.path, session }) },
      { id: "export", label: `${t("export")}…`, onSelect: () => shell.dialogs.setTransferTarget({ workspace: activeWorkspace.path, sessionID: session.id, title: session.title || session.id }) },
      { id: "delete", label: `${t("delete")}…`, danger: true, separated: true, onSelect: () => shell.dialogs.setDeleteTarget({ workspace: activeWorkspace.path, session }) },
    ];
  })();

  return (
    <div className="relative flex min-w-0 flex-1 flex-col bg-bg-deep">
      <div className="relative flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
        <div data-panel-row className="relative flex min-h-0 flex-1 gap-2">
          {/* The review toggle floats above the row, so it stays put while the
              panel opens and closes under it. It must outrank the transcript's
              sticky header, which is opaque and shares the row's top edge. */}
          {view.tab === "chat" && activeId && !atHome && (
            <div
              className="pointer-events-none absolute end-0 top-0 z-40 flex h-12 items-center"
              style={{ paddingInlineEnd: shell.resolvedLayout === "horizontal" ? 12 : 10 }}
            >
              <SessionPanelToggle
                open={shell.panel.panelOpen}
                onToggle={() => shell.panel.setPanelOpen((value) => !value)}
                keybind={shell.keybinds["panel.review"]}
                className="pointer-events-auto"
              />
            </div>
          )}
          <div
            inert={view.tab === "settings" ? true : undefined}
            aria-hidden={view.tab === "settings" ? true : undefined}
            className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-bg-base elevation-raised ${
              view.tab === "settings" ? "invisible" : ""
            }`}
          >
            {view.homeOpen ? (
              <HomePane />
            ) : activeId && !atHome ? (
              <div className="relative flex min-h-0 flex-1 flex-col">
                <MessagesPane
                  bottomInset={composerInset}
                  header={
                    <SessionHeader
                      workspace={activeWorkspace?.name}
                      workspaceIcon={activeWorkspace?.icon}
                      workspaceColor={activeWorkspace?.color}
                      worktree={activeLocation?.worktree}
                      directory={activeLocation?.directory ?? activeWorkspace?.path}
                      ancestors={activeAncestors}
                      onOpenSession={(sessionID) => {
                        if (!activeWorkspace) return;
                        shell.workspaceActions.select(activeWorkspace.path);
                        void shell.chatActions.open(activeWorkspace.path, sessionID);
                      }}
                      title={activeTitle || "New session"}
                      onOpenProjectHome={() => {
                        if (!activeWorkspace) return;
                        shell.workspaceActions.select(activeWorkspace.path);
                        view.showHome();
                      }}
                      onOpenProjectSettings={() => {
                        if (activeWorkspace) shell.openProjectSettings(activeWorkspace.path);
                      }}
                      running={Boolean(activeRunning && activeAncestors.length > 0)}
                      actions={sessionMenu}
                      context={{
                        usage: ringUsage,
                        detailsOpen: shell.panel.panelOpen && shell.panel.panelTab === "details",
                        onOpenDetails: () => shell.panel.openSidePanel("details"),
                      }}
                      reserveEnd
                      endInset={shell.resolvedLayout === "horizontal" ? 12 : 10}
                    />
                  }
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
                  <div className="pointer-events-auto">
                    <ComposerDock
                      onInset={setComposerInset}
                      child={
                        activeAncestors.length > 0
                          ? {
                              title: activeTitle || "Subagent",
                              running: Boolean(activeRunning),
                              onBack: () => {
                                const parent = activeAncestors[activeAncestors.length - 1];
                                if (!parent || !activeWorkspace) return;
                                shell.workspaceActions.select(activeWorkspace.path);
                                void shell.chatActions.open(activeWorkspace.path, parent.id);
                              },
                            }
                          : undefined
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <NewSessionPane />
            )}
          </div>

          <SessionPanelPane />
          {view.settingsOpen && <SettingsPane />}
        </div>
      </div>
    </div>
  );
}
