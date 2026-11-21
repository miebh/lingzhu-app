import { Show, Suspense, createEffect, createMemo, createSignal, lazy } from "solid-js";
import { SessionHeader } from "../../../components/session/SessionHeader";
import { SessionSummaryMenu } from "../../../components/session/SessionSummaryMenu";
import { api } from "../../../lib/api";
import { contextUsage, modelCost, modelWindow } from "../../../lib/contextUsage";
import { t } from "@lingzhu/ui/i18n";
import type { SessionLocation } from "@lingzhu/ui/types";
import { buildAncestors } from "../../derive";
import { useActiveChatField, useAtHome } from "../../hooks";
import { useShell } from "../../ShellProvider";
import { ComposerDock } from "../chat/ComposerDock";
import { NewSessionPane } from "./NewSessionPane";

const MessagesPane = lazy(async () => ({ default: (await import("../chat/MessagesPane")).MessagesPane }));

/**
 * The session route's content: header, transcript, composer and the subagent
 * back affordance. A draft with no turns falls back to the new-session surface.
 */
export function SessionScreen() {
  const shell = useShell();
  const activeWorkspace = () => shell.activeWorkspace;
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
  const [activeLocation, setActiveLocation] = createSignal<SessionLocation>();
  const [composerInset, setComposerInset] = createSignal(0);

  createEffect(() => {
    const sessionID = activeId();
    const workspace = activeWorkspace();
    const draft = activeDraft();
    setActiveLocation(undefined);
    if (!sessionID || !workspace || draft) return;
    let cancelled = false;
    api
      .location(workspace.path, sessionID)
      .then((value) => {
        if (!cancelled) setActiveLocation(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  });

  const activeAncestors = createMemo(() => buildAncestors(activeLocation(), shell.sessionsByWorkspace));
  // The catalog prices the model and states its context window, so the ring
  // follows a model switch without another request.
  const ringCost = createMemo(() => modelCost(shell.providers, activeProvider(), activeModel()));
  const ringWindow = createMemo(() => modelWindow(shell.providers, activeProvider(), activeModel()));
  const ringUsage = createMemo(() =>
    contextUsage({ tokens: activeTokens(), window: ringWindow(), usage: activeUsage() }, ringCost()),
  );
  const sessionMenu = createMemo(() => {
    const sessionID = activeId();
    const workspace = activeWorkspace();
    if (!sessionID || !workspace) return [];
    const session = shell.sessionsByWorkspace[workspace.path]?.find((entry) => entry.id === sessionID);
    if (!session) return [];
    return [
      {
        id: "rename",
        label: t("rename"),
        onSelect: () => shell.dialogs.setRenameTarget({ workspace: workspace.path, session }),
      },
      {
        id: "export",
        label: `${t("export")}…`,
        onSelect: () =>
          shell.dialogs.setTransferTarget({
            workspace: workspace.path,
            sessionID: session.id,
            title: session.title || session.id,
          }),
      },
      {
        id: "delete",
        label: `${t("delete")}…`,
        danger: true,
        separated: true,
        onSelect: () => shell.dialogs.setDeleteTarget({ workspace: workspace.path, session }),
      },
    ];
  });

  return (
    <Show when={!atHome()} fallback={<NewSessionPane />}>
      <div class="relative flex min-h-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <MessagesPane
            bottomInset={composerInset()}
            header={
              <SessionHeader
                workspace={activeWorkspace()?.name}
                workspaceIcon={activeWorkspace()?.icon}
                workspaceColor={activeWorkspace()?.color}
                worktree={activeLocation()?.worktree}
                directory={activeLocation()?.directory ?? activeWorkspace()?.path}
                ancestors={activeAncestors()}
                onOpenSession={(sessionID) => {
                  const workspace = activeWorkspace();
                  if (!workspace) return;
                  shell.workspaceActions.select(workspace.path);
                  void shell.chatActions.open(workspace.path, sessionID);
                }}
                title={activeTitle() || "New session"}
                onOpenProjectHome={() => {
                  const workspace = activeWorkspace();
                  if (!workspace) return;
                  shell.workspaceActions.select(workspace.path);
                  shell.view.showHome();
                }}
                onOpenProjectSettings={() => {
                  const workspace = activeWorkspace();
                  if (workspace) shell.openProjectSettings(workspace.path);
                }}
                running={Boolean(activeRunning() && activeAncestors().length > 0)}
                actions={sessionMenu()}
                context={{
                  usage: ringUsage(),
                  detailsOpen: shell.panel.panelOpen && shell.panel.panelTab === "details",
                  onOpenDetails: () => shell.panel.openSidePanel("details"),
                }}
                summary={
                  <SessionSummaryMenu
                    workspace={activeWorkspace()?.path}
                    mobile={shell.mobile}
                    onOpenMCP={(server) => {
                      const workspace = activeWorkspace();
                      if (workspace) shell.dialogs.setMCPTarget(workspace.path, server);
                    }}
                    onOpenSkill={(skillID) => {
                      const workspace = activeWorkspace();
                      const sessionID = activeId();
                      if (!workspace || !sessionID) return;
                      shell.dialogs.setSkillsTarget({
                        workspace: workspace.path,
                        sessionID,
                        title: activeTitle() || sessionID,
                        skillID,
                      });
                    }}
                    onOpenSkillFile={(path) => shell.panel.openFileInPanel(path)}
                    onOpenExtensions={() => shell.view.openSettings("extensions")}
                  />
                }
                reserveEnd
                endInset={10}
              />
            }
          />
        </Suspense>
        <div class="pointer-events-none absolute inset-x-0 bottom-0 z-40">
          <div class="pointer-events-auto">
            <ComposerDock
              onInset={setComposerInset}
              child={
                activeAncestors().length > 0
                  ? {
                      title: activeTitle() || "Subagent",
                      running: Boolean(activeRunning()),
                      onBack: () => {
                        const ancestors = activeAncestors();
                        const parent = ancestors[ancestors.length - 1];
                        const workspace = activeWorkspace();
                        if (!parent || !workspace) return;
                        shell.workspaceActions.select(workspace.path);
                        void shell.chatActions.open(workspace.path, parent.id);
                      },
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </Show>
  );
}
