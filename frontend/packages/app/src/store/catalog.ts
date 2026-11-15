import { create } from "zustand";
import { api } from "../lib/api";
import type { ProviderSettings } from "@lingzhu/ui/types";

/** The core's provider catalog plus the default selection it starts from. */
export interface Catalog {
  provider: string;
  model: string;
  providers: ProviderSettings[];
}

interface CatalogStore {
  catalog?: Catalog;
  reload: () => Promise<void>;
}

export const useCatalogStore = create<CatalogStore>((set) => ({
  catalog: undefined,

  reload: async () => {
    try {
      const settings = await api.settings();
      set({ catalog: { provider: settings.provider, model: settings.model, providers: settings.providers } });
    } catch {
      // The settings page surfaces config errors; the composer falls back to
      // the core's default selection.
    }
  },
}));

export function useCatalog(): Catalog | undefined {
  return useCatalogStore((state) => state.catalog);
}
