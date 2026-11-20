import { useEffect, useState } from "react";
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
export function PairingDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [items, setItems] = useState<PairingCode[]>([]);
  const [ttl, setTTL] = useState(60);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PairingResult>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (quiet = false) => {
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

  useEffect(() => {
    if (!open) {
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
    void load();
    const timer = window.setInterval(() => void load(true), 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const create = async () => {
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      const created = await api.createPairing(workspace, sessionID, ttl);
      setItems((current) => [...current, created]);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (item: PairingCode) => {
    if (!workspace || !sessionID) return;
    try {
      await api.revokePairing(workspace, sessionID, item.code);
      setItems((current) => current.filter((entry) => entry.code !== item.code));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const redeem = async () => {
    if (!workspace || !sessionID) return;
    const value = code.trim();
    if (!value) {
      setError("Pairing code is required.");
      return;
    }
    setBusy(true);
    try {
      const paired = await api.redeemPairing(workspace, sessionID, value);
      setResult(paired);
      setCode("");
      setItems((current) => current.filter((entry) => entry.code !== value.toLowerCase()));
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle>Pairing</DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {tr("dialogPairingHint")}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} mono />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={ttl}
            aria-label={tr("pairingPairingLifetime")}
            onChange={(event) => setTTL(Number(event.target.value))}
            className="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
          >
            <option value={60}>60 seconds</option>
            <option value={120}>2 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
          <Button type="button" size="sm" disabled={busy} onClick={() => void create()}>
            <QrCode />
            {tr("dialogCreateCode")}
          </Button>
        </div>

        <div className="mt-4 max-h-56 overflow-auto rounded-md border border-border-base">
          {items.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No active pairing codes."}
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.code}
                className="flex items-center gap-3 border-b border-border-base px-3 py-2 last:border-b-0"
              >
                <span className="font-mono text-reading tracking-widest text-text-base">{item.code}</span>
                <span className="min-w-0 flex-1 text-caption text-text-faint">
                  expires {formatTimeOfDay(item.expiresAt)} · {item.expiresIn}s
                </span>
                <Button type="button" variant="outline" size="xs" onClick={() => void copy(item)}>
                  <Copy />
                  {copied === item.code ? "Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={saving === item.code}
                  onClick={() => void savePairing(item)}
                >
                  <Save />
                  {saving === item.code ? "Saving…" : "Save"}
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
            ))
          )}
        </div>

        <div className="mt-4 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <p className="text-caption text-text-faint">Redeem a code</p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={code}
              placeholder={tr("dialogPairingCodePlaceholder")}
              aria-label={tr("pairingPairingCode")}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void redeem();
                }
              }}
              className="select-text font-mono tracking-widest"
            />
            <Button type="button" size="sm" disabled={busy} onClick={() => void redeem()}>
              Redeem
            </Button>
          </div>
          {result && (
            <p className="mt-2 text-meta text-state-fg-success select-text">
              Paired at {formatTimeOfDay(result.pairedAt)} · {result.directory || "workspace"}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
