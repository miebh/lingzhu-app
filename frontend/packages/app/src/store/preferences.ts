import { type Accessor } from "solid-js";
import { createStore } from "./create";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { applyPreferences, defaultPreferences, normalizePreferences } from "../lib/preferences";
import type { AppPreferences } from "@lingzhu/ui/types";
import { notify } from "./notify";

interface PreferencesStore {
  preferences: AppPreferences;
  /** Reads the stored preferences once; later calls reuse the same promise. */
  hydrate: () => Promise<void>;
  save: (next: AppPreferences) => Promise<boolean>;
}

let hydration: Promise<void> | undefined;

/** Local preferences: startup workspace, auto-approve, per-workspace models, appearance. */
export const usePreferencesStore = createStore<PreferencesStore>((set, get) => ({
  preferences: defaultPreferences,

  hydrate: () => {
    hydration ??= (async () => {
      try {
        const stored = await api.preferences();
        const preferences = normalizePreferences(stored);
        set({ preferences });
        applyPreferences(preferences);
      } catch (error) {
        notify(messageOf(error));
      }
    })();
    return hydration;
  },

  save: async (next) => {
    const previous = get().preferences;
    const preferences = normalizePreferences(next);
    // Appearance applies optimistically; a failed write rolls it back.
    set({ preferences });
    applyPreferences(preferences);
    try {
      await api.savePreferences(preferences);
      return true;
    } catch (error) {
      set({ preferences: previous });
      applyPreferences(previous);
      notify(messageOf(error));
      return false;
    }
  },
}));

export function usePreferences(): Accessor<AppPreferences> {
  return usePreferencesStore((state) => state.preferences);
}
