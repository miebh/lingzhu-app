import { exportJson, exportedAt, exportName } from "./exportFile";

import type { PairingCode } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for one pairing export. */
export function pairingExportName(code: string, date = new Date()): string {
  return exportName(code, "pairing", { fallback: "pairing", date });
}

/** Serializes one pairing code with its session and expiry metadata. */
export function serializePairing(input: { pairing: PairingCode; date?: Date }): string {
  return exportJson({
    code: input.pairing.code,
    sessionId: input.pairing.sessionId,
    expiresAt: input.pairing.expiresAt,
    expiresIn: input.pairing.expiresIn,
    exportedAt: exportedAt(input.date),
  });
}
