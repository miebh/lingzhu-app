import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { ProviderSettings } from "../lib/types";

/** The core's provider catalog plus the default selection it starts from. */
export interface Catalog {
  provider: string;
  model: string;
  providers: ProviderSettings[];
}

interface CatalogValue {
  catalog?: Catalog;
  reload: () => Promise<void>;
}

const CatalogContext = createContext<CatalogValue | undefined>(undefined);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog>();

  const reload = useCallback(async () => {
    try {
      const settings = await api.settings();
      setCatalog({ provider: settings.provider, model: settings.model, providers: settings.providers });
    } catch {
      // The settings page surfaces config errors; the composer falls back to
      // the core's default selection.
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ catalog, reload }), [catalog, reload]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside CatalogProvider");
  return value;
}
