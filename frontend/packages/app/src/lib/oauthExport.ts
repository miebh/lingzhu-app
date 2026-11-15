import { exportJson, exportedAt, exportName } from "./exportFile";

import type { OAuthStatus } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for an OAuth status export. */
export function oauthExportName(workspace: string, count: number, date = new Date()): string {
  return exportName(workspace, "oauth", { count, basename: true, fallback: "workspace", date });
}

/** Serializes OAuth endpoint status without tokens or client secrets. */
export function serializeOAuth(input: {
  workspace: string;
  statuses: OAuthStatus[];
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    exportedAt: exportedAt(input.date),
    count: input.statuses.length,
    services: input.statuses.map((item) => ({
    name: item.name,
    grant: item.grant,
    tokenUrl: item.token_url,
    authorizationUrl: item.authorization_url ?? null,
    clientId: item.client_id,
    scopes: item.scopes,
    authorized: item.authorized,
    expired: item.expired,
    expiresAt: item.expiresAt ?? null,
    hasRefreshToken: item.hasRefreshToken,
    })),
  });
}
