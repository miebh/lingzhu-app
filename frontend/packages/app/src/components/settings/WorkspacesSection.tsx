import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderClosed, Plus, Search, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Input } from "@lingzhu/ui/input";
import { Switch } from "@lingzhu/ui/switch";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { t } from "@lingzhu/ui/i18n";
import type { AppPreferences, ProjectInfo, WorkspaceInfo } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../workspace/ProjectAvatar";
import { SettingsField, SettingsRow, SettingsSection, SettingsSelect } from "./primitives";

interface Props {
  projects: WorkspaceInfo[];
  /** Opens this project's detail page once when arriving from a deep link. */
  initialProject?: string;
  onInitialProjectConsumed?: () => void;
  onAdd: () => void;
  onRemove: (path: string) => void;
  preferences: AppPreferences;
  onSavePreferences: (preferences: AppPreferences) => void;
}

/** Project cards, search, and the nested project settings page. */
export function ProjectsSection({
  projects,
  initialProject,
  onInitialProjectConsumed,
  onAdd,
  onRemove,
  preferences,
  onSavePreferences,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WorkspaceInfo>();
  const [info, setInfo] = useState<ProjectInfo>();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [startup, setStartup] = useState("");
  const needle = query.trim().toLowerCase();
  const nameFor = (project: WorkspaceInfo) => preferences.projectNames[project.path] || project.name;
  const saveMap = (key: "projectIcons" | "projectColors" | "projectWorktreeStartup", path: string, value: string) => {
    const next = { ...preferences[key] };
    if (value.trim()) next[path] = value.trim();
    else delete next[path];
    onSavePreferences({ ...preferences, [key]: next });
  };
  const filtered = useMemo(
    () =>
      needle
        ? projects.filter((project) => `${nameFor(project)} ${project.path}`.toLowerCase().includes(needle))
        : projects,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, needle, preferences.projectNames],
  );

  useEffect(() => {
    if (!selected) {
      setInfo(undefined);
      setError("");
      return;
    }
    setName(preferences.projectNames[selected.path] || selected.name);
    setStartup(preferences.projectWorktreeStartup[selected.path] || "");
    let live = true;
    void api
      .project(selected.path)
      .then((next) => {
        if (live) setInfo(next);
      })
      .catch((cause) => {
        if (live) setError(messageOf(cause));
      });
    return () => {
      live = false;
    };
  }, [selected]);

  useEffect(() => {
    if (!initialProject) return;
    const match = projects.find((project) => project.path.toLowerCase() === initialProject.toLowerCase());
    if (match) setSelected(match);
    onInitialProjectConsumed?.();
  }, [initialProject, projects, onInitialProjectConsumed]);

  if (selected) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setSelected(undefined)} className="gap-1.5 px-2">
            ← {t("backToProjects")}
          </Button>
        </div>
        <SettingsSection title={name || selected.path} description={selected.path}>
          <SettingsField label={t("projectName")} hint={t("projectNameHint")}>
            <Input
              value={name}
              aria-label={t("projectName")}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                const next = { ...preferences.projectNames };
                const value = name.trim();
                if (value) next[selected.path] = value;
                else delete next[selected.path];
                onSavePreferences({ ...preferences, projectNames: next });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.currentTarget.blur();
              }}
              className="select-text"
            />
          </SettingsField>
          <SettingsRow title={t("projectIcon")} description={t("projectIconDesc")}>
            <SettingsSelect
              label={t("projectIcon")}
              value={preferences.projectIcons[selected.path] ?? ""}
              options={[
                { value: "", label: t("letterIcon") },
                { value: "folder", label: t("folderIcon") },
                { value: "code-slash", label: t("codeFont") },
                { value: "outline-console", label: t("terminalIcon") },
                { value: "branch", label: t("branchIcon") },
                { value: "cube", label: t("cubeIcon") },
                { value: "brain", label: t("brainIcon") },
                { value: "server", label: t("serverIcon") },
              ]}
              onChange={(value) => saveMap("projectIcons", selected.path, value)}
            />
          </SettingsRow>
          <SettingsRow title={t("projectColor")} description={t("projectColorDesc")}>
            <SettingsSelect
              label={t("projectColor")}
              value={preferences.projectColors[selected.path] ?? "gray"}
              options={[
                { value: "gray", label: t("gray") },
                { value: "blue", label: t("blue") },
                { value: "green", label: t("green") },
                { value: "amber", label: t("amber") },
                { value: "red", label: t("red") },
                { value: "violet", label: t("violet") },
              ]}
              onChange={(value) => saveMap("projectColors", selected.path, value === "gray" ? "" : value)}
            />
          </SettingsRow>
          <SettingsField
            label={t("worktreeStartup")}
            hint={t("worktreeStartupHint")}
          >
            <Input
              value={startup}
              aria-label={t("worktreeStartup")}
              placeholder="npm install"
              onChange={(event) => setStartup(event.target.value)}
              onBlur={() => saveMap("projectWorktreeStartup", selected.path, startup)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.currentTarget.blur();
              }}
              className="select-text font-mono"
            />
          </SettingsField>
          <SettingsRow
            title={t("projectAutoApprove")}
            description={t("projectAutoApproveDesc")}
          >
            <Switch
              aria-label={t("projectAutoApprove")}
              checked={preferences.projectAutoApprove[selected.path] === true}
              onCheckedChange={(checked) => {
                const next = { ...preferences.projectAutoApprove };
                if (checked) next[selected.path] = true;
                else delete next[selected.path];
                onSavePreferences({ ...preferences, projectAutoApprove: next });
              }}
            />
          </SettingsRow>
          <SettingsRow title={t("status")} description={t("settingsServersDesc")}>
            <span
              className={
                selected.connected && !selected.starting
                  ? "text-caption text-state-fg-success"
                  : selected.starting
                    ? "text-caption text-text-muted"
                    : "text-caption text-state-fg-danger"
              }
            >
              {selected.connected && !selected.starting
                ? t("connected")
                : selected.starting
                  ? t("starting")
                  : t("offline")}
            </span>
          </SettingsRow>
          {error && (
            <p role="alert" className="px-0.5 py-2 text-meta leading-5 text-state-fg-danger">
              {error}
            </p>
          )}
          {info && (
            <>
              <SettingsField label={t("directory")}>
                <span className="min-w-0 break-all font-mono text-meta text-text-muted select-text">
                  {info.directory}
                </span>
              </SettingsField>
              <SettingsField label={t("config")}>
                <span className="min-w-0 break-all font-mono text-meta text-text-muted select-text">
                  {info.config || t("notLoadedConfig")}
                </span>
              </SettingsField>
              <SettingsField label={t("instructions")}>
                <span className="min-w-0 break-all font-mono text-meta text-text-muted select-text">
                  {info.instructions || t("noAgentsFile")}
                </span>
              </SettingsField>
              <SettingsRow title={t("sessions")} description={t("sessions")}>
                <span className="font-mono text-caption text-text-muted">{info.sessions}</span>
              </SettingsRow>
              <SettingsRow title={t("sourceControl")} description={t("sourceControl")}>
                <span className="text-caption text-text-muted">
                  {info.vcs
                    ? `${info.vcs.provider} · ${info.vcs.branch.current || info.vcs.branch.default || "detached"}`
                    : t("notGitRepo")}
                </span>
              </SettingsRow>
            </>
          )}
          <SettingsRow title={t("removeProject")} description={t("removeProjectDesc")}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const path = selected.path;
                setSelected(undefined);
                onRemove(path);
              }}
              className="gap-2 text-state-fg-danger"
            >
              <X className="size-4" />
              {t("removeAction")}
            </Button>
          </SettingsRow>
        </SettingsSection>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
        <Input
          value={query}
          aria-label={t("searchProjects")}
          placeholder={t("searchProjects")}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 rounded-[6px] bg-bg-layer-02/60 ps-10 pe-3 hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02"
        />
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <FolderClosed className="mb-2 size-6 text-icon-muted" />
          <span className="text-body font-[530] leading-4 text-text-base">{t("noProjectsYet")}</span>
          <span className="text-body font-[440] leading-4 text-text-muted">{t("noProjectsDesc")}</span>
          <Button variant="neutral" size="sm" onClick={onAdd} className="mt-4 gap-2">
            <Plus className="size-4" />
            {t("addProject")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-body font-[440] leading-4 text-text-muted">
          {t("noProjectsMatch", { query: query.trim() })}
        </p>
      ) : (
        <div role="list" className="overflow-hidden rounded-lg bg-bg-layer-01 px-1 py-1 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          {filtered.map((project) => (
            <div
              key={project.path}
              role="listitem"
              className="group flex h-10 items-center gap-2 rounded-[4px] px-3 transition-colors hover:bg-bg-layer-02 focus-within:bg-bg-layer-02"
            >
              <button
                type="button"
                onClick={() => setSelected(project)}
                className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[4px] text-start outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--border-focus)]"
              >
                <ProjectAvatar
                  name={nameFor(project)}
                  icon={preferences.projectIcons[project.path] || undefined}
                  color={preferences.projectColors[project.path]}
                />
                <span className="min-w-0 truncate text-body font-[530] leading-5 tracking-[-0.04px] text-text-base">
                  {nameFor(project)}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("projectSettingsFor", { name: nameFor(project) })}
                  onClick={() => setSelected(project)}
                  className="text-text-faint hover:text-text-base"
                >
                  <ChevronRight />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("removeServer", { name: nameFor(project) })}
                  onClick={() => onRemove(project.path)}
                  className="text-text-faint hover:text-state-fg-danger"
                >
                  <X />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
