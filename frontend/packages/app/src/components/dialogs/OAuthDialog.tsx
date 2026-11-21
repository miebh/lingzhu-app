import { For, Show, createEffect, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function OAuthDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<OAuthStatus[]>([]);
  const [authorizations, setAuthorizations] = createSignal<Record<string, OAuthAuthorization>>({});
  const [codes, setCodes] = createSignal<Record<string, string>>({});
  const [states, setStates] = createSignal<Record<string, string>>({});
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const load = async () => {
    if (!props.workspace) return;
    setLoading(true);
    setError("");
    try {
      setItems(await api.oauthStatuses(props.workspace));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
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
  });

  const saveStatuses = async () => {
    const workspace = props.workspace;
    if (!workspace || items().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        oauthExportName(workspace, items().length),
        serializeOAuth({ workspace, statuses: items() }),
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
    update(setItems, items, (current) => current.map((item) => (item.name === status.name ? status : item)));
  };

  const authorize = async (item: OAuthStatus) => {
    if (!props.workspace) return;
    setBusy(item.name);
    try {
      const auth = await api.authorizeOAuth(props.workspace, item.name);
      update(setAuthorizations, authorizations, (current) => ({ ...current, [item.name]: auth }));
      update(setStates, states, (current) => ({ ...current, [item.name]: auth.state }));
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
    if (!props.workspace) return;
    const code = (codes()[item.name] ?? "").trim();
    if (!code) {
      setError("Authorization code is required.");
      return;
    }
    setBusy(item.name);
    try {
      const updated = await api.exchangeOAuth(
        props.workspace,
        item.name,
        code,
        (states()[item.name] ?? "").trim(),
      );
      replace(updated);
      update(setCodes, codes, (current) => ({ ...current, [item.name]: "" }));
      setError("");
      setNotice(`${item.name} authorized.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const refresh = async (item: OAuthStatus) => {
    if (!props.workspace) return;
    setBusy(item.name);
    try {
      replace(await api.refreshOAuth(props.workspace, item.name));
      setError("");
      setNotice(`${item.name} token refreshed.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  };

  const revoke = async (item: OAuthStatus) => {
    if (!props.workspace) return;
    setBusy(item.name);
    try {
      await api.revokeOAuth(props.workspace, item.name);
      update(setItems, items, (current) =>
        current.map((entry) =>
          entry.name === item.name
            ? { ...entry, authorized: false, expired: false, expiresAt: undefined, hasRefreshToken: false }
            : entry,
        ),
      );
      update(setAuthorizations, authorizations, (current) => {
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <KeyRound class="size-4 text-text-faint" />
              OAuth
            </DialogTitle>
            <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || items().length === 0}
              onClick={() => void saveStatuses()}
            >
              <Save />
              {saving() ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} shrink />

        <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={items().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? "Loading…" : "No OAuth endpoints configured."}
              </p>
            }
          >
            <For each={items()}>
              {(item) => {
                const auth = () => authorizations()[item.name];
                return (
                  <div class="border-b border-border-base p-3 last:border-b-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-body text-text-base">{item.name}</span>
                      <span class="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                        {item.grant}
                      </span>
                      <span
                        class={`rounded-xs border border-border-base px-1 text-caption ${
                          item.authorized && !item.expired
                            ? "text-state-fg-success"
                            : "text-state-fg-warning"
                        }`}
                      >
                        {item.authorized ? (item.expired ? "expired" : "authorized") : "not authorized"}
                      </span>
                      <span class="text-caption text-text-faint">{item.client_id}</span>
                    </div>
                    <p class="mt-1 truncate text-caption text-text-faint">
                      scopes: {item.scopes.length > 0 ? item.scopes.join(" ") : "(none)"}
                      {item.expiresAt ? ` · expires ${formatDateTime(item.expiresAt) || item.expiresAt}` : ""}
                      {item.hasRefreshToken ? " · refresh token" : ""}
                    </p>
                    <p class="mt-0.5 truncate font-mono text-caption text-text-faint">{item.token_url}</p>

                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={busy() === item.name}
                        onClick={() => void authorize(item)}
                      >
                        <ExternalLink />
                        Authorize
                      </Button>
                      <Show when={item.authorized}>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={busy() === item.name}
                          onClick={() => void refresh(item)}
                        >
                          <RefreshCw />
                          {tr("dialogRefreshToken")}
                        </Button>
                      </Show>
                      <Show when={item.authorized}>
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          disabled={busy() === item.name}
                          onClick={() => void revoke(item)}
                        >
                          Revoke
                        </Button>
                      </Show>
                    </div>

                    <Show when={auth()}>
                      {(current) => (
                        <div class="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border-base bg-bg-layer-01 p-2">
                          <Input
                            value={codes()[item.name] ?? ""}
                            aria-label={`${item.name} authorization code`}
                            placeholder={tr("oAuthAuthorizationCode")}
                            onInput={(event) =>
                              update(setCodes, codes, (current) => ({
                                ...current,
                                [item.name]: event.currentTarget.value,
                              }))
                            }
                            class="min-w-40 flex-1 select-text font-mono"
                          />
                          <Button
                            type="button"
                            size="xs"
                            disabled={busy() === item.name}
                            onClick={() => void exchange(item)}
                          >
                            Exchange
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => window.open(current().url, "_blank", "noopener,noreferrer")}
                          >
                            <ExternalLink />
                            {tr("dialogOpenPage")}
                          </Button>
                        </div>
                      )}
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
