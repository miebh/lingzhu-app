import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { ChevronRight, FolderClosed, Plus, Search, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
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
  onSavePreferences: (preferences: AppPreferences) => Promise<boolean> | void;
}

/** Project cards, search, and the nested project settings page. */
export function ProjectsSection(props: Props) {
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal<WorkspaceInfo>();
  const [info, setInfo] = createSignal<ProjectInfo>();
  const [error, setError] = createSignal("");
  const [name, setName] = createSignal("");
  const [startup, setStartup] = createSignal("");
  const [startupSaved, setStartupSaved] = createSignal<boolean>();
  const needle = createMemo(() => query().trim().toLowerCase());
  const nameFor = (project: WorkspaceInfo) => props.preferences.projectNames[project.path] || project.name;
  const saveMap = (key: "projectIcons" | "projectColors" | "projectWorktreeStartup", path: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed === (props.preferences[key][path] ?? "")) return;
    const next = { ...props.preferences[key] };
    if (trimmed) next[path] = trimmed;
    else delete next[path];
    props.onSavePreferences({ ...props.preferences, [key]: next });
  };
  const saveStartup = async () => {
    const project = selected();
    if (!project) return;
    const value = startup().trim();
    if (value === (props.preferences.projectWorktreeStartup[project.path] ?? "")) {
      setStartupSaved(undefined);
      return;
    }
    const next = { ...props.preferences.projectWorktreeStartup };
    if (value) next[project.path] = value;
    else delete next[project.path];
    try {
      const saved = await props.onSavePreferences({ ...props.preferences, projectWorktreeStartup: next });
      setStartupSaved(saved !== false);
    } catch {
      setStartupSaved(false);
    }
  };
  const filtered = createMemo(() =>
    needle()
      ? props.projects.filter((project) => `${nameFor(project)} ${project.path}`.toLowerCase().includes(needle()))
      : props.projects,
  );

  createEffect(() => {
    const project = selected();
    if (!project) {
      setInfo(undefined);
      setError("");
      return;
    }
    const preferences = untrack(() => props.preferences);
    setName(preferences.projectNames[project.path] || project.name);
    setStartup(preferences.projectWorktreeStartup[project.path] || "");
    setStartupSaved(undefined);
    let live = true;
    void api
      .project(project.path)
      .then((next) => {
        if (live) setInfo(next);
      })
      .catch((cause) => {
        if (live) setError(messageOf(cause));
      });
    onCleanup(() => {
      live = false;
    });
  });

  createEffect(() => {
    const initialProject = props.initialProject;
    if (!initialProject) return;
    const match = props.projects.find((project) => project.path.toLowerCase() === initialProject.toLowerCase());
    if (match) setSelected(match);
    props.onInitialProjectConsumed?.();
  });

  return (
    <Show
      when={selected()}
      fallback={
        <div class="flex flex-col gap-6">
          <div class="relative min-w-0">
            <Search class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
            <Input
              value={query()}
              aria-label={t("searchProjects")}
              placeholder={t("searchProjects")}
              spellcheck={false}
              autocomplete="off"
              onInput={(event) => setQuery(event.currentTarget.value)}
              class="h-9 rounded-[6px] bg-bg-layer-02/60 ps-10 pe-3 hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02"
            />
          </div>

          <Show
            when={props.projects.length > 0}
            fallback={
              <div class="flex flex-col items-center gap-2 py-24 text-center">
                <FolderClosed class="mb-2 size-6 text-icon-muted" />
                <span class="text-body font-[530] leading-4 text-text-base">{t("noProjectsYet")}</span>
                <span class="text-body font-[440] leading-4 text-text-muted">{t("noProjectsDesc")}</span>
                <Button variant="neutral" size="sm" onClick={() => props.onAdd()} class="mt-4 gap-2">
                  <Plus class="size-4" />
                  {t("addProject")}
                </Button>
              </div>
            }
          >
            <Show
              when={filtered().length > 0}
              fallback={
                <p class="py-12 text-center text-body font-[440] leading-4 text-text-muted">
                  {t("noProjectsMatch", { query: query().trim() })}
                </p>
              }
            >
              <div
                role="list"
                class="overflow-hidden rounded-lg bg-bg-layer-01 px-1 py-1 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]"
              >
                <For each={filtered()}>
                  {(project) => (
                    <div
                      role="listitem"
                      class="group flex h-10 items-center gap-2 rounded-[4px] px-3 transition-colors hover:bg-bg-layer-02 focus-within:bg-bg-layer-02"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(project)}
                        class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[4px] text-start outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--border-focus)]"
                      >
                        <ProjectAvatar
                          name={nameFor(project)}
                          icon={props.preferences.projectIcons[project.path] || undefined}
                          color={props.preferences.projectColors[project.path]}
                        />
                        <span class="min-w-0 truncate text-body font-[530] leading-5 tracking-[-0.04px] text-text-base">
                          {nameFor(project)}
                        </span>
                      </button>
                      <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("projectSettingsFor", { name: nameFor(project) })}
                          onClick={() => setSelected(project)}
                          class="text-text-faint hover:text-text-base"
                        >
                          <ChevronRight />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("removeServer", { name: nameFor(project) })}
                          onClick={() => props.onRemove(project.path)}
                          class="text-text-faint hover:text-state-fg-danger"
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      }
    >
      {(project) => (
        <div class="flex flex-col gap-8">
          <div class="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setSelected(undefined)} class="gap-1.5 px-2">
              ← {t("backToProjects")}
            </Button>
          </div>
          <SettingsSection title={name() || project().path} description={project().path}>
            <SettingsField label={t("projectName")} hint={t("projectNameHint")}>
              <Input
                value={name()}
                aria-label={t("projectName")}
                onInput={(event) => setName(event.currentTarget.value)}
                onBlur={() => {
                  const next = { ...props.preferences.projectNames };
                  const value = name().trim();
                  if (value) next[project().path] = value;
                  else delete next[project().path];
                  props.onSavePreferences({ ...props.preferences, projectNames: next });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                class="select-text"
              />
            </SettingsField>
            <SettingsRow title={t("projectIcon")} description={t("projectIconDesc")}>
              <SettingsSelect
                label={t("projectIcon")}
                value={props.preferences.projectIcons[project().path] ?? ""}
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
                onChange={(value) => saveMap("projectIcons", project().path, value)}
              />
            </SettingsRow>
            <SettingsRow title={t("projectColor")} description={t("projectColorDesc")}>
              <SettingsSelect
                label={t("projectColor")}
                value={props.preferences.projectColors[project().path] ?? "gray"}
                options={[
                  { value: "gray", label: t("gray") },
                  { value: "blue", label: t("blue") },
                  { value: "green", label: t("green") },
                  { value: "amber", label: t("amber") },
                  { value: "red", label: t("red") },
                  { value: "violet", label: t("violet") },
                ]}
                onChange={(value) => saveMap("projectColors", project().path, value === "gray" ? "" : value)}
              />
            </SettingsRow>
            <SettingsField label={t("worktreeStartup")} hint={t("worktreeStartupHint")}>
              <Textarea
                rows={5}
                value={startup()}
                aria-label={t("worktreeStartup")}
                placeholder="npm install"
                spellcheck={false}
                onInput={(event) => {
                  setStartup(event.currentTarget.value);
                  setStartupSaved(undefined);
                }}
                onBlur={() => void saveStartup()}
                class="select-text resize-y font-mono"
              />
              <Show when={startupSaved() === false}>
                <div class="flex items-center gap-2">
                  <span class="text-caption leading-4 text-state-fg-danger">
                    {t("worktreeStartupSaveFailed")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void saveStartup()}
                  >
                    {t("retry")}
                  </Button>
                </div>
              </Show>
            </SettingsField>
            <SettingsRow title={t("projectAutoApprove")} description={t("projectAutoApproveDesc")}>
              <Switch
                aria-label={t("projectAutoApprove")}
                checked={props.preferences.projectAutoApprove[project().path] === true}
                onCheckedChange={(checked) => {
                  const next = { ...props.preferences.projectAutoApprove };
                  if (checked) next[project().path] = true;
                  else delete next[project().path];
                  props.onSavePreferences({ ...props.preferences, projectAutoApprove: next });
                }}
              />
            </SettingsRow>
            <SettingsRow title={t("status")} description={t("settingsServersDesc")}>
              <span
                class={
                  project().connected && !project().starting
                    ? "text-caption text-state-fg-success"
                    : project().starting
                      ? "text-caption text-text-muted"
                      : "text-caption text-state-fg-danger"
                }
              >
                {project().connected && !project().starting
                  ? t("connected")
                  : project().starting
                    ? t("starting")
                    : t("offline")}
              </span>
            </SettingsRow>
            <Show when={error()}>
              <p role="alert" class="px-0.5 py-2 text-meta leading-5 text-state-fg-danger">
                {error()}
              </p>
            </Show>
            <Show when={info()}>
              {(current) => (
                <>
                  <SettingsField label={t("directory")}>
                    <span class="min-w-0 break-all font-mono text-meta text-text-muted select-text">
                      {current().directory}
                    </span>
                  </SettingsField>
                  <SettingsField label={t("config")}>
                    <span class="min-w-0 break-all font-mono text-meta text-text-muted select-text">
                      {current().config || t("notLoadedConfig")}
                    </span>
                  </SettingsField>
                  <SettingsField label={t("instructions")}>
                    <span class="min-w-0 break-all font-mono text-meta text-text-muted select-text">
                      {current().instructions || t("noAgentsFile")}
                    </span>
                  </SettingsField>
                  <SettingsRow title={t("sessions")} description={t("sessions")}>
                    <span class="font-mono text-caption text-text-muted">{current().sessions}</span>
                  </SettingsRow>
                  <SettingsRow title={t("sourceControl")} description={t("sourceControl")}>
                    <span class="text-caption text-text-muted">
                      {current().vcs
                        ? `${current().vcs!.provider} · ${
                            current().vcs!.branch.current || current().vcs!.branch.default || "detached"
                          }`
                        : t("notGitRepo")}
                    </span>
                  </SettingsRow>
                </>
              )}
            </Show>
            <SettingsRow title={t("removeProject")} description={t("removeProjectDesc")}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const path = project().path;
                  setSelected(undefined);
                  props.onRemove(path);
                }}
                class="gap-2 text-state-fg-danger"
              >
                <X class="size-4" />
                {t("removeAction")}
              </Button>
            </SettingsRow>
          </SettingsSection>
        </div>
      )}
    </Show>
  );
}
