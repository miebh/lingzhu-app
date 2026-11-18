import { create } from "zustand";
import { api } from "../lib/api";
import type { AppSettings, ProviderSettings } from "@lingzhu/ui/types";

/** The core's provider catalog plus the default selection it starts from. */
export interface Catalog {
  provider: string;
  model: string;
  providers: ProviderSettings[];
}

interface CatalogStore {
  catalog?: Catalog;
  /** Reads the current projection; the app pushes changes as they happen. */
  reload: () => Promise<void>;
  /** Adopts a projection the service already pushed. */
  adopt: (settings: AppSettings) => void;
}

const toCatalog = (settings: AppSettings): Catalog => ({
  provider: settings.provider,
  model: settings.model,
  providers: settings.providers,
});

// A slow earlier read must not overwrite the list a later push already stored.
let requestSeq = 0;

export const useCatalogStore = create<CatalogStore>((set) => ({
  catalog: undefined,

  reload: async () => {
    const seq = ++requestSeq;
    try {
      const settings = await api.settings();
      if (seq === requestSeq) set({ catalog: toCatalog(settings) });
    } catch {
      // The settings page surfaces config errors; the composer falls back to
      // the core's default selection.
    }
  },

  adopt: (settings) => {
    requestSeq += 1;
    set({ catalog: toCatalog(settings) });
  },
}));

export function useCatalog(): Catalog | undefined {
  return useCatalogStore((state) => state.catalog);
}
