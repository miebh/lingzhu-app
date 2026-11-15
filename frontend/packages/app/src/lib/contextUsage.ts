import type { ModelCost, UsageTotals } from "@lingzhu/ui/types";

/** What the header ring reports about one session. */
export interface ContextUsage {
  /** Estimated prompt size of the next request. */
  tokens: number;
  /** The model's context window; 0 when unknown. */
  window: number;
  /** Share of the window the prompt takes, 0–100. */
  percent: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Total spend in USD, when the catalog prices this model. */
  cost?: number;
}

/** The slice of a chat the context numbers need; a live chat or a fetch result fits. */
export interface ContextSource {
  tokens: number;
  window: number;
  usage?: UsageTotals;
}

/** Context share above which the ring turns to the danger role. */
export const CONTEXT_DANGER_PERCENT = 90;

/** Sums the provider usage reported across a session's runs. */
function usageTotals(usage: UsageTotals | undefined): Required<UsageTotals> {
  return {
    input: usage?.input ?? 0,
    output: usage?.output ?? 0,
    cacheRead: usage?.cacheRead ?? 0,
    cacheWrite: usage?.cacheWrite ?? 0,
  };
}

/**
 * Spend for one session. Catalog prices are per million tokens, so each
 * counter is scaled before it is priced. Undefined when the model is unpriced,
 * which keeps the row hidden instead of showing a misleading $0.00.
 */
function usageCost(usage: UsageTotals | undefined, cost: ModelCost | undefined): number | undefined {
  if (!cost) return undefined;
  const priced = (cost.input ?? 0) + (cost.output ?? 0) + (cost.cache_read ?? 0) + (cost.cache_write ?? 0);
  if (priced <= 0) return undefined;
  const totals = usageTotals(usage);
  return (
    (totals.input * (cost.input ?? 0) +
      totals.output * (cost.output ?? 0) +
      totals.cacheRead * (cost.cache_read ?? 0) +
      totals.cacheWrite * (cost.cache_write ?? 0)) /
    1_000_000
  );
}

/** Derives the context numbers from the active chat and the model's price. */
export function contextUsage(source: ContextSource | undefined, cost?: ModelCost): ContextUsage {
  const totals = usageTotals(source?.usage);
  const tokens = source?.tokens ?? 0;
  const window = source?.window ?? 0;

  return {
    tokens,
    window,
    percent: window > 0 ? Math.min(100, Math.round((tokens / window) * 100)) : 0,
    ...totals,
    cost: usageCost(source?.usage, cost),
  };
}

/**
 * The catalog price of one model, looked up by the provider and model ids the
 * session runs with. A variant suffix (`model::high`) resolves to its base.
 */
export function modelCost(
  providers: readonly { id: string; models: readonly { id: string; contextWindow?: number; cost?: ModelCost }[] }[],
  providerID: string | undefined,
  modelID: string | undefined,
): ModelCost | undefined {
  return modelEntry(providers, providerID, modelID)?.cost;
}

/** The catalog context window of one model, 0 when the model is unknown. */
export function modelWindow(
  providers: readonly { id: string; models: readonly { id: string; contextWindow?: number }[] }[],
  providerID: string | undefined,
  modelID: string | undefined,
): number {
  return modelEntry(providers, providerID, modelID)?.contextWindow ?? 0;
}

function modelEntry<T extends { id: string }>(
  providers: readonly { id: string; models: readonly T[] }[],
  providerID: string | undefined,
  modelID: string | undefined,
): T | undefined {
  if (!modelID) return undefined;
  const [base] = modelID.split("::");
  return providers.find((provider) => provider.id === providerID)?.models.find((model) => model.id === base);
}
