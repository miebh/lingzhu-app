import { useEffect, useState } from "react";
import { ExternalLink, KeyRound, RefreshCw, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { oauthExportName, serializeOAuth } from "../../lib/oauthExport";
import type { OAuthAuthorization, OAuthStatus } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Lists OAuth endpoints and supports authorize, exchange, refresh and revoke. */
export function OAuthDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [items, setItems] = useState<OAuthStatus[]>([]);
  const [authorizations, setAuthorizations] = useState<Record<string, OAuthAuthorization>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      setItems(await api.oauthStatuses(workspace));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setItems([]);
      setAuthorizations({});
      setCodes({});
      setStates({});
      setError("");
      setNotice("");
      setBusy("");
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const saveStatuses = async () => {
    if (!workspace || items.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        oauthExportName(workspace, items.length),
        serializeOAuth({ workspace, statuses: items }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const replace = (status: OAuthStatus) => {
    setItems((current) => current.map((item) => (item.name === status.name ? status : item)));
  };

  const authorize = async (item: OAuthStatus) => {
    if (!workspace) return;
    setBusy(item.name);
    try {
      const auth = await api.authorizeOAuth(workspace, item.name);
      setAuthorizations((current) => ({ ...current, [item.name]: auth }));
      setStates((current) => ({ ...current, [item.name]: auth.state }));
      window.open(auth.url, "_blank", "noopener,noreferrer");
      setError("");
      setNotice(`Opened the authorization page for ${item.name}.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const exchange = async (item: OAuthStatus) => {
    if (!workspace) return;
    const code = (codes[item.name] ?? "").trim();
    if (!code) {
      setError("Authorization code is required.");
      return;
    }
    setBusy(item.name);
    try {
      const updated = await api.exchangeOAuth(
        workspace,
        item.name,
        code,
        (states[item.name] ?? "").trim(),
      );
      replace(updated);
      setCodes((current) => ({ ...current, [item.name]: "" }));
      setError("");
      setNotice(`${item.name} authorized.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const refresh = async (item: OAuthStatus) => {
    if (!workspace) return;
    setBusy(item.name);
    try {
      replace(await api.refreshOAuth(workspace, item.name));
      setError("");
      setNotice(`${item.name} token refreshed.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const revoke = async (item: OAuthStatus) => {
    if (!workspace) return;
    setBusy(item.name);
    try {
      await api.revokeOAuth(workspace, item.name);
      setItems((current) => current.map((entry) => (entry.name === item.name ? { ...entry, authorized: false, expired: false, expiresAt: undefined, hasRefreshToken: false } : entry)));
      setAuthorizations((current) => {
        const next = { ...current };
        delete next[item.name];
        return next;
      });
      setError("");
      setNotice(`${item.name} revoked.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-text-faint" />
              OAuth
            </DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || items.length === 0}
              onClick={() => void saveStatuses()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {items.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No OAuth endpoints configured."}
            </p>
          ) : (
            items.map((item) => {
              const auth = authorizations[item.name];
              return (
                <div key={item.name} className="border-b border-border-base p-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body text-text-base">{item.name}</span>
                    <span className="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                      {item.grant}
                    </span>
                    <span
                      className={`rounded-xs border border-border-base px-1 text-caption ${
                        item.authorized && !item.expired
                          ? "text-state-fg-success"
                          : "text-state-fg-warning"
                      }`}
                    >
                      {item.authorized ? (item.expired ? "expired" : "authorized") : "not authorized"}
                    </span>
                    <span className="text-caption text-text-faint">{item.client_id}</span>
                  </div>
                  <p className="mt-1 truncate text-caption text-text-faint">
                    scopes: {item.scopes.length > 0 ? item.scopes.join(" ") : "(none)"}
                    {item.expiresAt ? ` · expires ${formatDateTime(item.expiresAt) || item.expiresAt}` : ""}
                    {item.hasRefreshToken ? " · refresh token" : ""}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-caption text-text-faint">{item.token_url}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={busy === item.name}
                      onClick={() => void authorize(item)}
                    >
                      <ExternalLink />
                      Authorize
                    </Button>
                    {item.authorized && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={busy === item.name}
                        onClick={() => void refresh(item)}
                      >
                        <RefreshCw />
                        {tr("dialogRefreshToken")}
                      </Button>
                    )}
                    {item.authorized && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        disabled={busy === item.name}
                        onClick={() => void revoke(item)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>

                  {auth && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border-base bg-bg-layer-01 p-2">
                      <Input
                        value={codes[item.name] ?? ""}
                        aria-label={`${item.name} authorization code`}
                        placeholder={tr("oAuthAuthorizationCode")}
                        onChange={(event) =>
                          setCodes((current) => ({ ...current, [item.name]: event.target.value }))
                        }
                        className="min-w-40 flex-1 select-text font-mono"
                      />
                      <Button
                        type="button"
                        size="xs"
                        disabled={busy === item.name}
                        onClick={() => void exchange(item)}
                      >
                        Exchange
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          window.open(auth.url, "_blank", "noopener,noreferrer")
                        }
                      >
                        <ExternalLink />
                        {tr("dialogOpenPage")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
