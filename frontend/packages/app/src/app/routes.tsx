import {
  Navigate,
  Route,
  Router,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "@solidjs/router";
import { Show, createEffect, onCleanup, type ParentProps } from "solid-js";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { AppShell } from "./AppShell";
import { HomePane } from "./features/home/HomePane";
import { NewSessionPane } from "./features/session/NewSessionPane";
import { SessionScreen } from "./features/session/SessionScreen";
import { SettingsPane } from "./features/settings/SettingsPane";
import { useStartupRestore } from "./useStartupRestore";
import { Toaster } from "../components/shell/Toaster";
import { installNavigator, setCurrentHref, uninstallNavigator, type NavigateOptions } from "../lib/navigation";
import { decodeSegment, sessionHref } from "../lib/routes";
import { finishStartupRestore } from "../lib/startupRestore";
import { useChatStore } from "../store/chat";
import { useViewStore } from "../store/view";
import { useWorkspaceStore } from "../store/workspaces";

/**
 * URL-driven shell, mirroring the reference app's route table:
 *
 *   /                                  home
 *   /workspace/:workspaceKey/session/:sessionID
 *   /new-session?draftId=…             a draft with no durable turn yet
 *   /settings/:section?                settings
 *
 * The layout route keeps the shell mounted across pages, so the sidebar and
 * titlebar never remount.
 */
export function AppRoutes() {
  return (
    <Route component={AppLayout}>
      <Route path="/" component={HomeRoute} />
      <Route path="/workspace/:workspaceKey/session/:sessionID" component={SessionRoute} />
      <Route path="/new-session" component={NewSessionRoute} />
      <Route path="/settings/:section?" component={SettingsRoute} />
      <Route path="*" component={() => <Navigate href="/" />} />
    </Route>
  );
}

export function AppRoot() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

function AppLayout(props: ParentProps) {
  return (
    <>
      <RouteState />
      <AppShell>{props.children}</AppShell>
      <Toaster />
    </>
  );
}

/** Installs the URL navigator for stores and projects the path onto view flags. */
function RouteState() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigator = (href: string, options?: NavigateOptions) =>
    navigate(href, { replace: options?.replace, scroll: false });

  installNavigator(navigator);
  onCleanup(() => uninstallNavigator(navigator));
  createEffect(() => {
    const href = location.pathname + location.search;
    setCurrentHref(href);
    useViewStore.getState().syncRoute(href);
    // A deep link, a pending notice or any other non-Home launch wins over the
    // remembered tab and must not leave the restore waiting for a later Home.
    if (location.pathname !== "/") finishStartupRestore();
  });

  return null;
}

function HomeRoute() {
  useStartupRestore();
  return <HomePane />;
}

function SessionRoute() {
  const params = useParams<{ workspaceKey: string; sessionID: string }>();
  const workspace = () => decodeSegment(params.workspaceKey);

  createEffect(() => {
    const path = workspace();
    const sessionID = params.sessionID;
    if (!path || !sessionID) return;
    const state = useChatStore.getState();
    const known = Boolean(state.chats[chatKey(path, sessionID)]);
    const active = state.activeByWorkspace[path] === sessionID;
    useWorkspaceStore.getState().select(path);
    if (!known || !active) void state.open(path, sessionID);
  });

  return (
    <Show when={workspace()} fallback={<Navigate href="/" />}>
      <SessionScreen />
    </Show>
  );
}

function NewSessionRoute() {
  const [search] = useSearchParams<{ draftId?: string }>();
  const navigate = useNavigate();
  const activePath = useWorkspaceStore((state) => state.activePath);
  // A draft is found by its own ID, not by the global active workspace: the
  // project picker can re-target it without invalidating the route.
  const entry = useChatStore((state) => {
    const id = search.draftId;
    return id ? Object.values(state.chats).find((chat) => chat.id === id) : undefined;
  });

  // A draft is only reachable while its chat is still alive; a stale URL (for
  // example after a reload) goes back home instead of opening a broken tab.
  createEffect(() => {
    if (!search.draftId) return;
    if (!entry()) navigate("/", { replace: true });
  });

  // The draft owns its workspace; opening its URL re-selects that workspace.
  createEffect(() => {
    const chat = entry();
    if (chat?.workspace) useWorkspaceStore.getState().select(chat.workspace);
  });

  // The first prompt turns the draft into a durable session; the URL follows.
  createEffect(() => {
    const chat = entry();
    if (!chat || chat.draft) return;
    const path = chat.workspace ?? activePath();
    if (path) navigate(sessionHref(path, chat.id), { replace: true });
  });

  return <NewSessionPane draftId={search.draftId} />;
}

function SettingsRoute() {
  return <SettingsPane />;
}
