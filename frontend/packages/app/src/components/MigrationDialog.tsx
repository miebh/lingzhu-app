import { useEffect, useState } from "react";
import { Database, History } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { ConfirmDialog } from "./Dialogs";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { MigrationInfo } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner, DetailRow } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Store schema, row counts and legacy backups, with an idempotent re-import. */
export function MigrationDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [info, setInfo] = useState<MigrationInfo>();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      setInfo(await api.migration(workspace));
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
      setInfo(undefined);
      setError("");
      setNotice("");
      setConfirming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const migrate = async () => {
    setConfirming(false);
    if (!workspace) return;
    setLoading(true);
    try {
      const result = await api.migrate(workspace);
      setInfo(result);
      setNotice(
        `Migration complete · schema ${result.migration.schemaVersion} · ${result.migration.sessions} sessions`,
      );
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="wide" className="flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <Database className="size-4 text-text-faint" />
                Migration
              </DialogTitle>
              <DialogDescription className="truncate">{name || workspace}</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setConfirming(true)}
              >
                <History />
                {tr("migrationRunMigration")}
              </Button>
              <RefreshButton loading={loading} onRefresh={() => void load()} />
            </div>
          </div>

          <ErrorBanner error={error} className="mt-3" />
          <NoticeBanner notice={notice} />

          {info ? (
            <>
              <div className="mt-4 rounded-md border border-border-base">
                <DetailRow label="Schema version" value={String(info.migration.schemaVersion)} />
                <DetailRow label="Database" value={info.database} />
                <DetailRow label="Session dir" value={info.migration.sessionDir} />
                <DetailRow label="Sessions" value={String(info.migration.sessions)} />
                <DetailRow label="Events" value={String(info.migration.events)} />
              </div>

              <div className="mt-4">
                <p className="text-caption text-text-faint">
                  Legacy backups ({info.migration.legacyBackups.length})
                </p>
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-border-base">
                  {info.migration.legacyBackups.length === 0 ? (
                    <p className="p-3 text-meta text-text-faint">No legacy backups on disk.</p>
                  ) : (
                    info.migration.legacyBackups.map((file) => (
                      <p
                        key={file}
                        className="border-b border-border-base px-3 py-1.5 font-mono text-meta text-text-muted last:border-b-0"
                      >
                        {file}
                      </p>
                    ))
                  )}
                </div>
                <p className="mt-2 text-caption text-text-faint">
                  Re-running the migration imports older JSONL logs again; already imported rows are skipped.
                </p>
              </div>
            </>
          ) : (
            <p className="mt-4 text-meta text-text-faint">{loading ? "Loading…" : "No migration data."}</p>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        title={tr("migrationRunMigration")}
        description="Re-import legacy JSONL logs into the database? Already imported rows are skipped."
        confirmLabel="Run"
        onOpenChange={(next) => {
          if (!next) setConfirming(false);
        }}
        onConfirm={() => void migrate()}
      />
    </>
  );
}
