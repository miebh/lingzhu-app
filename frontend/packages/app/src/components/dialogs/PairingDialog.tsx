import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Copy, QrCode, Save, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { pairingExportName, serializePairing } from "../../lib/pairingExport";
import type { PairingCode, PairingResult } from "@lingzhu/ui/types";
import { formatTimeOfDay } from "@lingzhu/ui/format";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Creates, lists, copies, revokes and redeems short-lived session codes. */
export function PairingDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<PairingCode[]>([]);
  const [ttl, setTTL] = createSignal(60);
  const [code, setCode] = createSignal("");
  const [result, setResult] = createSignal<PairingResult>();
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal("");
  const [saving, setSaving] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const load = async (quiet = false) => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    if (!quiet) setLoading(true);
    try {
      const list = await api.pairings(workspace, sessionID);
      setItems(list.pairings);
      if (!quiet) setError("");
    } catch (err) {
      if (!quiet) setError(messageOf(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  createEffect(() => {
    if (!props.open) {
      setItems([]);
      setTTL(60);
      setCode("");
      setResult(undefined);
      setError("");
      setCopied("");
      setSaving("");
      setNotice("");
      return;
    }
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    void load();
    const timer = window.setInterval(() => void load(true), 10_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const create = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      const created = await api.createPairing(workspace, sessionID, ttl());
      update(setItems, items, (current) => [...current, created]);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (item: PairingCode) => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    try {
      await api.revokePairing(workspace, sessionID, item.code);
      update(setItems, items, (current) => current.filter((entry) => entry.code !== item.code));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const redeem = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const value = code().trim();
    if (!value) {
      setError("Pairing code is required.");
      return;
    }
    setBusy(true);
    try {
      const paired = await api.redeemPairing(workspace, sessionID, value);
      setResult(paired);
      setCode("");
      update(setItems, items, (current) => current.filter((entry) => entry.code !== value.toLowerCase()));
      setError("");
    } catch (err) {
      setResult(undefined);
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const savePairing = async (item: PairingCode) => {
    setSaving(item.code);
    try {
      const path = await api.saveTextFile(
        pairingExportName(item.code),
        serializePairing({ pairing: item }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving("");
    }
  };

  const copy = async (item: PairingCode) => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopied(item.code);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>{tr("pairingTitle")}</DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {tr("dialogPairingHint")}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={ttl()}
            aria-label={tr("pairingPairingLifetime")}
            onChange={(event) => setTTL(Number(event.currentTarget.value))}
            class="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
          >
            <option value={60}>60 seconds</option>
            <option value={120}>2 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
          <Button type="button" size="sm" disabled={busy()} onClick={() => void create()}>
            <QrCode />
            {tr("dialogCreateCode")}
          </Button>
        </div>

        <div class="mt-4 max-h-56 overflow-auto rounded-md border border-border-base">
          <Show
            when={items().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? tr("loading") : tr("noPairingCodes")}
              </p>
            }
          >
            <For each={items()}>
              {(item) => (
                <div class="flex items-center gap-3 border-b border-border-base px-3 py-2 last:border-b-0">
                  <span class="font-mono text-reading tracking-widest text-text-base">{item.code}</span>
                  <span class="min-w-0 flex-1 text-caption text-text-faint">
                    expires {formatTimeOfDay(item.expiresAt)} · {item.expiresIn}s
                  </span>
                  <Button type="button" variant="outline" size="xs" onClick={() => void copy(item)}>
                    <Copy />
                    {copied() === item.code ? tr("copied") : tr("copy")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={saving() === item.code}
                    onClick={() => void savePairing(item)}
                  >
                    <Save />
                    {saving() === item.code ? tr("saving") : tr("save")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Revoke ${item.code}`}
                    onClick={() => void revoke(item)}
                  >
                    <X />
                  </Button>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="mt-4 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <p class="text-caption text-text-faint">{tr("pairingRedeemCode")}</p>
          <div class="mt-2 flex items-center gap-2">
            <Input
              value={code()}
              placeholder={tr("dialogPairingCodePlaceholder")}
              aria-label={tr("pairingPairingCode")}
              onInput={(event) => setCode(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void redeem();
                }
              }}
              class="select-text font-mono tracking-widest"
            />
            <Button type="button" size="sm" disabled={busy()} onClick={() => void redeem()}>
              Redeem
            </Button>
          </div>
          <Show when={result()}>
            {(paired) => (
              <p class="mt-2 text-meta text-state-fg-success select-text">
                Paired at {formatTimeOfDay(paired().pairedAt)} · {paired().directory || "workspace"}
              </p>
            )}
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
