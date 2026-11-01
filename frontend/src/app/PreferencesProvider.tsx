import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { applyPreferences, defaultPreferences } from "../lib/preferences";
import type { AppPreferences } from "../lib/types";
import { useNotify } from "./NotifyProvider";
import { useLatest } from "./use-latest";

interface PreferencesValue {
  preferences: AppPreferences;
  /** False until the stored preferences have been read once. */
  ready: boolean;
  save: (next: AppPreferences) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesValue | undefined>(undefined);

/** Local preferences: startup workspace, auto-approve, per-workspace models, appearance. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const notify = useNotify();
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [ready, setReady] = useState(false);
  const latest = useLatest(preferences);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const value = await api.preferences();
        if (!alive) return;
        setPreferences(value);
        applyPreferences(value);
      } catch (error) {
        notify(messageOf(error));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [notify]);

  const save = useCallback(
    async (next: AppPreferences) => {
      const previous = latest.current;
      // Appearance applies optimistically; a failed write rolls it back.
      setPreferences(next);
      applyPreferences(next);
      try {
        await api.savePreferences(next);
      } catch (error) {
        setPreferences(previous);
        applyPreferences(previous);
        notify(messageOf(error));
      }
    },
    [latest, notify],
  );

  const value = useMemo(() => ({ preferences, ready, save }), [preferences, ready, save]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
