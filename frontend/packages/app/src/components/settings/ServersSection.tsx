import { useEffect, useState } from "react";
import { Ellipsis, Plus, RefreshCw, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { t } from "@lingzhu/ui/i18n";
import { SettingsRow, SettingsSelect } from "./primitives";

interface Props {
  workspaces: WorkspaceInfo[];
  onAdd?: () => void;
  onRemove?: (path: string) => void;
  onRestart?: (path: string) => void;
}

const SHELL_COMMANDS = [
  { value: "", key: "shellAuto" },
  { value: "powershell -NoProfile -NonInteractive -Command", key: "shellPowerShell" },
  { value: "cmd /C", key: "shellCommandPrompt" },
  { value: "bash -lc", key: "shellBash" },
];

/** Server connections and each server's own terminal shell. */
export function ServersSection({ workspaces, onAdd, onRemove, onRestart }: Props) {
  const [shells, setShells] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const single = workspaces.length === 1;

  useEffect(() => {
    let live = true;
    void Promise.allSettled(
      workspaces.map(async (workspace) => {
        const config = await api.coreConfig(workspace.path);
        return { path: workspace.path, shell: (config.shell ?? []).join(" ") };
      }),
    ).then((results) => {
      if (!live) return;
      const nextShells: Record<string, string> = {};
      const nextErrors: Record<string, string> = {};
      results.forEach((result, index) => {
        const path = workspaces[index]?.path;
        if (!path) return;
        if (result.status === "fulfilled") nextShells[path] = result.value.shell;
        else nextErrors[path] = messageOf(result.reason);
      });
      setShells(nextShells);
      setErrors(nextErrors);
    });
    return () => {
      live = false;
    };
  }, [workspaces]);

  const commitShell = async (path: string, value: string) => {
    setShells((current) => ({ ...current, [path]: value }));
    try {
      await api.updateCoreConfig(path, {
        shell: value
          .trim()
          .split(/\s+/)
          .filter((part) => part.length > 0),
      });
      setErrors((current) => ({ ...current, [path]: "" }));
    } catch (cause) {
      setErrors((current) => ({ ...current, [path]: messageOf(cause) }));
    }
  };

  const shellOptions = (path: string) => {
    const current = shells[path] ?? "";
    const known = SHELL_COMMANDS.some((item) => item.value === current);
    return [
      ...SHELL_COMMANDS.map((item) => ({ value: item.value, label: t(item.key as never) })),
      ...(known || !current ? [] : [{ value: current, label: t("shellCustom") }]),
    ];
  };

  const connectionRow = (workspace: WorkspaceInfo) => (
    <div className="flex min-h-12 flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
      <span
        role="status"
        aria-label={workspace.connected ? t("connected") : t("offline")}
        className={`size-2 shrink-0 rounded-full ${workspace.connected ? "bg-state-fg-success" : "bg-state-fg-danger"}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="min-w-0 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
          {workspace.name || workspace.path}
        </span>
        <span className="min-w-0 truncate font-mono text-caption leading-4 text-text-faint" dir="ltr">
          {workspace.addr ? `http://${workspace.addr}` : workspace.path}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("serverActions")}
            className="text-text-faint hover:text-text-base"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onRestart?.(workspace.path)}>
            <RefreshCw />
            {t("refresh")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => onRemove?.(workspace.path)}>
            <Trash2 />
            {t("removeAction")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const shellRow = (workspace: WorkspaceInfo) => (
    <>
      <SettingsRow title={t("terminalShell")} description={t("terminalShellDesc")}>
        <SettingsSelect
          label={t("terminalShellFor", { name: workspace.name || workspace.path })}
          value={shells[workspace.path] ?? ""}
          options={shellOptions(workspace.path)}
          onChange={(value) => void commitShell(workspace.path, value)}
        />
      </SettingsRow>
      {errors[workspace.path] && (
        <p role="alert" className="pb-3 text-meta leading-5 text-state-fg-danger">
          {errors[workspace.path]}
        </p>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      {workspaces.map((workspace) =>
        single ? (
          <div key={workspace.path} className="flex flex-col gap-8">
            <section className="flex flex-col gap-4">
              <h2 className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                {t("connectionSection")}
              </h2>
              <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
                {connectionRow(workspace)}
              </div>
            </section>
            <section className="flex flex-col gap-4">
              <h2 className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                {t("preferences")}
              </h2>
              <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
                {shellRow(workspace)}
              </div>
            </section>
          </div>
        ) : (
          <section key={workspace.path} aria-label={workspace.name || workspace.path} className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
              <div className="border-b-[0.5px] border-border-base">{connectionRow(workspace)}</div>
              {shellRow(workspace)}
            </div>
          </section>
        ),
      )}

      {workspaces.length === 0 && (
        <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          <SettingsRow title={t("noServers")} description={t("noServersDesc")}>
            <Button variant="neutral" size="sm" onClick={() => onAdd?.()} className="gap-2">
              <Plus className="size-4" />
              {t("addServer")}
            </Button>
          </SettingsRow>
        </div>
      )}
    </div>
  );
}
