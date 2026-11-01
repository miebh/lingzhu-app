import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AppTabID } from "../components/TabBar";

interface ViewValue {
  tab: AppTabID;
  settingsOpen: boolean;
  select: (tab: AppTabID) => void;
  showChat: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

const ViewContext = createContext<ViewValue | undefined>(undefined);

/**
 * Which page fills the main pane. Settings is an overlay tab, so opening it
 * must not lose the chat's scroll position or composer draft.
 */
export function ViewProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<AppTabID>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const select = useCallback((next: AppTabID) => setTab(next), []);
  const showChat = useCallback(() => setTab("chat"), []);
  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    setTab("settings");
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setTab((current) => (current === "settings" ? "chat" : current));
  }, []);

  const value = useMemo(
    () => ({ tab, settingsOpen, select, showChat, openSettings, closeSettings }),
    [tab, settingsOpen, select, showChat, openSettings, closeSettings],
  );
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useView(): ViewValue {
  const value = useContext(ViewContext);
  if (!value) throw new Error("useView must be used inside ViewProvider");
  return value;
}
