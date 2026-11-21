import { createEffect, createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import {
  Bell,
  Cpu,
  Flask,
  GitBranch,
  Info,
  Keyboard,
  Plug,
  Providers,
  Server,
  SlidersHorizontal,
  Worktree,
  X,
} from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { AppInfo, AppPreferences, ProviderSettings, WorkspaceInfo } from "@lingzhu/ui/types";
import { AboutSection } from "./AboutSection";
import { ExtensionsSection } from "./ExtensionsSection";
import { GeneralSection } from "./GeneralSection";
import { ModelsSection } from "./ModelsSection";
import { ExperimentalSection } from "./ExperimentalSection";
import { NotificationsSection } from "./NotificationsSection";
import { ProjectsSection } from "./WorkspacesSection";
import { ProvidersSection } from "./ProvidersSection";
import { ServersSection } from "./ServersSection";
import { SettingsNav, type SettingsSearchEntry } from "./SettingsNav";
import { SettingsSelect } from "./primitives";
import { ShortcutsSection } from "./ShortcutsSection";
import { WorktreesSection } from "./WorktreesSection";
import { useCoreConfig } from "./useCoreConfig";
import { useCatalog } from "../../app/useApp";
import { t, useT, type MessageKey } from "@lingzhu/ui/i18n";
import type { SettingsSectionID } from "../../lib/settings";

interface SectionItem {
  id: SettingsSectionID;
  label: string;
  description: string;
  icon: Component<{ class?: string }>;
}

/** Root tabs mirror the reference settings center. Groups only separate, they carry no heading. */
const GROUPS: { label?: string; items: SectionItem[] }[] = [
  {
    items: [
      { id: "providers", label: "Providers", description: "settingsProvidersDesc", icon: Providers },
      { id: "models", label: "Models", description: "settingsModelsDesc", icon: Cpu },
      { id: "extensions", label: "Extensions", description: "settingsExtensionsDesc", icon: Plug },
      { id: "projects", label: "Projects", description: "settingsProjectsDesc", icon: Worktree },
      { id: "worktrees", label: "Worktrees", description: "settingsWorktreesDesc", icon: GitBranch },
    ],
  },
  {
    items: [
      { id: "general", label: "General", description: "settingsGeneralDesc", icon: SlidersHorizontal },
      { id: "notifications", label: "Notifications", description: "settingsNotificationsDesc", icon: Bell },
      { id: "shortcuts", label: "Shortcuts", description: "settingsShortcutsDesc", icon: Keyboard },
      { id: "servers", label: "Servers", description: "settingsServersDesc", icon: Server },
    ],
  },
  {
    items: [
      { id: "experimental", label: "Experimental", description: "settingsExperimentalDesc", icon: Flask },
      { id: "about", label: "About", description: "settingsAboutDesc", icon: Info },
    ],
  },
];

const SECTIONS = GROUPS.flatMap((group) => group.items);

const EMPTY_PROVIDERS: ProviderSettings[] = [];

function localizedGroups() {
  return GROUPS.map((group) => ({
    ...group,
    label: group.label ? t(group.label.toLowerCase() as MessageKey) : undefined,
    items: group.items.map((item) => ({ ...item, label: t(item.id as MessageKey) })),
  }));
}

function localizedLabel(id: SettingsSectionID) {
  return t(id as MessageKey);
}

interface Props {
  /** True while any session has a run in flight; core config writes are refused. */
  busy?: boolean;
  /** Active page; other parts of the app can deep-link into a section. */
  section: SettingsSectionID;
  onSectionChange: (section: SettingsSectionID) => void;
  workspaces: WorkspaceInfo[];
  /** Active workspace for workspace-scoped inventories such as skills. */
  workspace?: string;
  /** Project to open on the Projects page, used by the session location card. */
  project?: string;
  onProjectConsumed?: () => void;
  /** Session counts keyed by directory, for the Worktrees page. */
  sessionCounts?: Record<string, number>;
  preferences: AppPreferences;
  onSavePreferences: (preferences: AppPreferences) => Promise<boolean>;
  /** Receives the workspaces whose core was not restarted by this app. */
  onSaved: (reused: string[]) => void;
  /** Leaves settings; the rail's back button uses it. */
  onBack?: () => void;
  /** Workspace actions exposed by the Workspaces page. */
  onAddWorkspace?: () => void;
  onRemoveWorkspace?: (path: string) => void;
  onRestartWorkspace?: (path: string) => void;
  /** Opens a skill file in the session side panel, when one is active. */
  onOpenSkillFile?: (path: string) => void;
  /** Opens the raw configuration file in the session side panel. */
  onOpenConfigFile?: () => void;
}

/**
 * Settings center: a local navigation rail on the left and one scroll area per
 * section on the right. Core config writes restart owned cores; app preferences
 * apply immediately. Every control saves on its own, with no page-level Save.
 */
export function SettingsPage(props: Props) {
  const tr = useT();
  const catalog = useCatalog();
  const { draft, settingsError, saveError, reload, dismissSaveError, update, commit, updateAndCommit } =
    useCoreConfig({ onSaved: (reused) => props.onSaved(reused) });

  const [info, setInfo] = createSignal<AppInfo>();
  const [infoError, setInfoError] = createSignal<string>();

  onMount(() => {
    let alive = true;
    setInfo(undefined);
    setInfoError(undefined);
    api
      .info()
      .then((value) => {
        if (alive) setInfo(value);
      })
      .catch((cause) => {
        if (alive) setInfoError(messageOf(cause));
      });

    onCleanup(() => {
      alive = false;
    });
  });

  const savePreferences = (next: AppPreferences) => props.onSavePreferences(next);

  const active = () => SECTIONS.find((item) => item.id === props.section) ?? SECTIONS[0];

  // Search indexes the rows the sections render, so every row is reachable
  // without a hand-maintained catalog.
  let page: HTMLDivElement | undefined;
  const [index, setIndex] = createSignal<SettingsSearchEntry[]>([]);
  const [reveal, setReveal] = createSignal<{ entry: SettingsSearchEntry; token: number }>();

  createEffect(() => {
    if (!draft() || !page) {
      setIndex([]);
      return;
    }
    const entries: SettingsSearchEntry[] = [];
    const seen = new Set<string>();
    for (const sectionElement of page.querySelectorAll<HTMLElement>("[data-settings-section]")) {
      const id = sectionElement.dataset.settingsSection as SettingsSectionID | undefined;
      if (!id) continue;
      const sectionLabel = localizedLabel(id);
      const rows = [
        sectionElement,
        ...sectionElement.querySelectorAll<HTMLElement>("[data-setting-row]"),
      ];
      for (const row of rows) {
        const title = row.dataset.settingRow?.trim();
        if (!title) continue;
        const key = `${id}\u0000${title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ key, section: id, sectionLabel, title, keywords: row.dataset.settingKeywords ?? "" });
      }
    }
    setIndex(entries);
  });

  // A page change starts at its top, like the reference settings shell.
  createEffect(() => {
    const section = props.section;
    draft();
    const panel = page?.querySelector<HTMLElement>(`[data-settings-section="${section}"]`);
    panel?.scrollTo({ top: 0 });
  });

  // Choosing a search result scrolls its row into view and flashes the row
  // with the selection overlay, then fades it out.
  createEffect(() => {
    const current = reveal();
    if (!current) return;
    const frame = window.requestAnimationFrame(() => {
      const scope = page?.querySelector<HTMLElement>(`[data-settings-section="${current.entry.section}"]`);
      const candidates = scope ? [scope, ...scope.querySelectorAll<HTMLElement>("[data-setting-row]")] : [];
      const row = candidates.find((element) => element.dataset.settingRow === current.entry.title);
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      row.classList.remove("settings-target-flash");
      // Restart the animation when the same row is chosen twice.
      void row.offsetWidth;
      row.classList.add("settings-target-flash");
      window.setTimeout(() => row.classList.remove("settings-target-flash"), 1900);
    });
    onCleanup(() => window.cancelAnimationFrame(frame));
  });

  const revealSetting = (entry: SettingsSearchEntry) => {
    props.onSectionChange(entry.section);
    setReveal({ entry, token: Date.now() });
  };

  return (
    <div
      ref={(element) => {
        page = element;
      }}
      class="flex min-h-0 flex-1 select-none"
    >
      <div class="flex min-h-0 w-full flex-1 overflow-hidden rounded-[10px] bg-bg-base elevation-raised">
        <div class="flex min-h-0 w-full min-w-0 px-[max(0px,calc((100%-1048px)/2))]">
          <SettingsNav
            groups={localizedGroups()}
            section={props.section}
            index={index()}
            onSectionChange={props.onSectionChange}
            onReveal={revealSetting}
            onBack={props.onBack}
          />

          <div class="flex min-w-0 max-w-settings flex-1 flex-col">
            <div class="flex items-center gap-2 px-3 pt-4 md:hidden">
              <SettingsSelect
                label={t("settingsSectionLabel")}
                value={props.section}
                options={SECTIONS.map((item) => ({
                  value: item.id,
                  label: localizedLabel(item.id),
                }))}
                onChange={(value) => props.onSectionChange(value as SettingsSectionID)}
              />
            </div>
            <header class="settings-header relative flex shrink-0 flex-col gap-1 pt-6 pb-0 md:pt-12">
              <div class="flex items-start justify-between gap-4">
                <div class="flex min-w-0 flex-col gap-1">
                  <h1 class="text-[15px] font-[640] text-text-base">
                    {active().id === "servers" && props.workspaces.length === 1
                      ? t("serverSingular")
                      : localizedLabel(active().id)}
                  </h1>
                  <span class="text-caption leading-4 text-text-muted">
                    {t(active().description as MessageKey)}
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-2 pt-0.5">
                  <Show
                    when={
                      (props.section === "projects" || props.section === "servers") && props.onAddWorkspace
                    }
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => props.onAddWorkspace?.()}
                      class="gap-1.5 text-text-muted hover:text-text-base"
                    >
                      <span class="text-[13px] leading-4">+</span>
                      {props.section === "projects" ? t("addProject") : t("addServer")}
                    </Button>
                  </Show>
                </div>
              </div>
            </header>

            <Show when={props.busy || saveError()}>
              <div class="flex shrink-0 flex-col gap-1 border-b border-border-base py-2">
                <Show when={props.busy}>
                  <p class="text-caption leading-4 text-state-fg-warning">
                    {t("settingsBusy")}
                  </p>
                </Show>
                <Show when={saveError()}>
                  <div class="flex items-start gap-2">
                    <p role="alert" class="min-w-0 flex-1 text-caption leading-4 text-state-fg-danger">
                      {saveError()}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={tr("dismissSaveError")}
                      onClick={dismissSaveError}
                      class="text-text-faint hover:text-text-base"
                    >
                      <X />
                    </Button>
                  </div>
                </Show>
              </div>
            </Show>

            <div class="relative min-h-0 flex-1">
              <Show
                when={draft()}
                fallback={
                  <div class="mx-auto w-full max-w-settings py-6">
                    <Show
                      when={settingsError()}
                      fallback={
                        <div role="status" aria-label={tr("loadingSettings")} class="flex flex-col gap-3">
                          <For each={[0, 1, 2, 3]}>
                            {(index) => (
                              <div class="flex flex-col gap-2">
                                <div class="h-2 w-20 rounded-xs bg-bg-layer-03 motion-safe:animate-pulse" />
                                <div class="h-7 w-full rounded-md bg-bg-layer-01 motion-safe:animate-pulse" />
                              </div>
                            )}
                          </For>
                        </div>
                      }
                    >
                      <div class="flex flex-col items-start gap-3">
                        <p role="alert" class="text-meta leading-5 text-state-fg-danger">
                          {settingsError()}
                        </p>
                        <Button variant="outline" size="sm" onClick={reload}>
                          {t("retry")}
                        </Button>
                      </div>
                    </Show>
                  </div>
                }
              >
                <For each={SECTIONS}>
                  {(item) => {
                    const visible = () => item.id === props.section;
                    const sectioned =
                      item.id === "general" ||
                      item.id === "models" ||
                      item.id === "shortcuts" ||
                      item.id === "notifications" ||
                      item.id === "providers";
                    return (
                      <div
                        data-settings-section={item.id}
                        aria-hidden={visible() ? undefined : true}
                        inert={visible() ? undefined : true}
                        class={`scroll-stable no-scrollbar absolute inset-0 overflow-y-auto ${visible() ? "" : "invisible"}`}
                      >
                        <div class={`w-full pb-20 ${sectioned ? "pt-8" : "pt-6"}`}>
                          <Show when={item.id === "general"}>
                            <GeneralSection
                              preferences={{ preferences: props.preferences, save: savePreferences }}
                            />
                          </Show>
                          <Show when={item.id === "experimental"}>
                            <ExperimentalSection
                              preferences={{ preferences: props.preferences, save: savePreferences }}
                            />
                          </Show>
                          <Show when={item.id === "shortcuts"}>
                            <ShortcutsSection
                              preferences={{ preferences: props.preferences, save: savePreferences }}
                            />
                          </Show>
                          <Show when={item.id === "notifications"}>
                            <NotificationsSection
                              preferences={{ preferences: props.preferences, save: savePreferences }}
                            />
                          </Show>
                          <Show when={item.id === "projects"}>
                            <ProjectsSection
                              projects={props.workspaces}
                              initialProject={props.project}
                              onInitialProjectConsumed={props.onProjectConsumed}
                              onAdd={() => props.onAddWorkspace?.()}
                              onRemove={(path) => props.onRemoveWorkspace?.(path)}
                              preferences={props.preferences}
                              onSavePreferences={savePreferences}
                            />
                          </Show>
                          <Show when={item.id === "worktrees"}>
                            <WorktreesSection
                              active={props.section === "worktrees"}
                              workspace={props.workspace}
                              workspaces={props.workspaces}
                              sessionCounts={props.sessionCounts}
                            />
                          </Show>
                          <Show when={item.id === "extensions"}>
                            <ExtensionsSection
                              workspace={props.workspace}
                              onOpenSkillFile={props.onOpenSkillFile}
                              onOpenConfigFile={props.onOpenConfigFile}
                            />
                          </Show>
                          <Show when={item.id === "providers"}>
                            <ProvidersSection
                              scope={{
                                draft: draft()!,
                                busy: props.busy ?? false,
                                update,
                                commit,
                                updateAndCommit,
                              }}
                              preferences={props.preferences}
                              onSavePreferences={savePreferences}
                            />
                          </Show>
                          <Show when={item.id === "models"}>
                            <ModelsSection
                              providers={catalog()?.providers ?? EMPTY_PROVIDERS}
                              preferences={props.preferences}
                              onSavePreferences={savePreferences}
                            />
                          </Show>
                          <Show when={item.id === "servers"}>
                            <ServersSection
                              workspaces={props.workspaces}
                              onAdd={() => props.onAddWorkspace?.()}
                              onRemove={(path) => props.onRemoveWorkspace?.(path)}
                              onRestart={(path) => props.onRestartWorkspace?.(path)}
                            />
                          </Show>
                          <Show when={item.id === "about"}>
                            <AboutSection info={info()} error={infoError()} />
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
