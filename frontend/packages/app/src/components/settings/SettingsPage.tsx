import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  Bell,
  Cpu,
  Flask,
  GitBranch,
  Info,
  Keyboard,
  Palette,
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
import type { AppInfo, AppPreferences, WorkspaceInfo } from "@lingzhu/ui/types";
import { AboutSection } from "./AboutSection";
import { AppearanceSection } from "./AppearanceSection";
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
import { t, useT, type MessageKey } from "@lingzhu/ui/i18n";
import type { SettingsSectionID } from "../../lib/settings";

interface SectionItem {
  id: SettingsSectionID;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
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
      { id: "appearance", label: "Appearance", description: "Theme, type and motion on this machine.", icon: Palette },
      { id: "notifications", label: "Notifications", description: "settingsNotificationsDesc", icon: Bell },
      { id: "shortcuts", label: "Shortcuts", description: "settingsShortcutsDesc", icon: Keyboard },
      { id: "servers", label: "Servers", description: "Local cores, permissions and execution limits.", icon: Server },
    ],
  },
  {
    items: [
      { id: "experimental", label: "Experimental", description: "Opt-in sidebar organization.", icon: Flask },
      { id: "about", label: "About", description: "settingsAboutDesc", icon: Info },
    ],
  },
];

const SECTIONS = GROUPS.flatMap((group) => group.items);

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
  onSavePreferences: (preferences: AppPreferences) => Promise<void>;
  /** Receives the workspaces whose core was not restarted by this app. */
  onSaved: (reused: string[]) => void;
  /** Leaves settings; the rail's back button uses it. */
  onBack?: () => void;
  /** Workspace actions exposed by the Workspaces page. */
  onAddWorkspace?: () => void;
  onRemoveWorkspace?: (path: string) => void;
  onRestartWorkspace?: (path: string) => void;
}

/**
 * Settings center: a local navigation rail on the left and one scroll area per
 * section on the right. Core config writes restart owned cores; app preferences
 * apply immediately. Every control saves on its own, with no page-level Save.
 */
export function SettingsPage({
  busy = false,
  section,
  onSectionChange,
  workspaces,
  workspace,
  project,
  onProjectConsumed,
  sessionCounts,
  preferences,
  onSavePreferences,
  onSaved,
  onBack,
  onAddWorkspace,
  onRemoveWorkspace,
  onRestartWorkspace,
}: Props) {
  const tr = useT();
  const {
    draft,
    settingsError,
    saveError,
    reload,
    dismissSaveError,
    update,
    commit,
    updateAndCommit,
  } = useCoreConfig({ onSaved });

  const [info, setInfo] = useState<AppInfo>();
  const [infoError, setInfoError] = useState<string>();

  useEffect(() => {
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

    return () => {
      alive = false;
    };
  }, []);

  const savePreferences = useCallback(
    (next: AppPreferences) => {
      void onSavePreferences(next);
    },
    [onSavePreferences],
  );

  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  // Search indexes the rows the sections render, so every row is reachable
  // without a hand-maintained catalog.
  const page = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<SettingsSearchEntry[]>([]);
  const [reveal, setReveal] = useState<{ entry: SettingsSearchEntry; token: number }>();

  useEffect(() => {
    if (!draft || !page.current) {
      setIndex([]);
      return;
    }
    const entries: SettingsSearchEntry[] = [];
    const seen = new Set<string>();
    for (const sectionElement of page.current.querySelectorAll<HTMLElement>("[data-settings-section]")) {
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
  }, [draft]);

  // A page change starts at its top, like the reference settings shell.
  useEffect(() => {
    const panel = page.current?.querySelector<HTMLElement>(`[data-settings-section="${section}"]`);
    panel?.scrollTo({ top: 0 });
  }, [section]);

  // Choosing a search result scrolls its row into view and flashes the row
  // with the selection overlay, then fades it out.
  useEffect(() => {
    if (!reveal) return;
    const frame = window.requestAnimationFrame(() => {
      const scope = page.current?.querySelector<HTMLElement>(`[data-settings-section="${reveal.entry.section}"]`);
      const candidates = scope
        ? [scope, ...scope.querySelectorAll<HTMLElement>("[data-setting-row]")]
        : [];
      const row = candidates.find((element) => element.dataset.settingRow === reveal.entry.title);
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      row.classList.remove("settings-target-flash");
      // Restart the animation when the same row is chosen twice.
      void row.offsetWidth;
      row.classList.add("settings-target-flash");
      window.setTimeout(() => row.classList.remove("settings-target-flash"), 1900);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reveal]);

  const revealSetting = (entry: SettingsSearchEntry) => {
    onSectionChange(entry.section);
    setReveal({ entry, token: Date.now() });
  };

  return (
    <div ref={page} className="flex min-h-0 flex-1 select-none">
      <div className="flex min-h-0 w-full flex-1 overflow-hidden rounded-[10px] bg-bg-base elevation-raised">
        <div className="flex min-h-0 w-full min-w-0 px-[max(0px,calc((100%-1048px)/2))]">
          <SettingsNav
            groups={localizedGroups()}
            section={section}
            index={index}
            onSectionChange={onSectionChange}
            onReveal={revealSetting}
            onBack={onBack}
          />

          <div className="flex min-w-0 max-w-settings flex-1 flex-col">
            <div className="flex items-center gap-2 px-3 pt-4 md:hidden">
              <SettingsSelect
                label="Settings section"
                value={section}
                options={SECTIONS.map((item) => ({
                  value: item.id,
                  label: localizedLabel(item.id),
                }))}
                onChange={(value) => onSectionChange(value as SettingsSectionID)}
              />
            </div>
            <header className="settings-header relative flex shrink-0 flex-col gap-1 pt-6 pb-0 md:pt-12">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <h1 className="text-[15px] font-[640] text-text-base">
                    {active.id === "servers" && workspaces.length === 1
                      ? t("serverSingular")
                      : localizedLabel(active.id)}
                  </h1>
                  <span className="text-caption leading-4 text-text-muted">{t(active.description as MessageKey)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  {(section === "projects" || section === "servers") && onAddWorkspace && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onAddWorkspace}
                      className="gap-1.5 text-text-muted hover:text-text-base"
                    >
                      <span className="text-[13px] leading-4">+</span>
                      {section === "projects" ? t("addProject") : t("addServer")}
                    </Button>
                  )}
                </div>
              </div>
            </header>

          {(busy || saveError) && (
            <div className="flex shrink-0 flex-col gap-1 border-b border-border-base py-2">
            {busy && (
              <p className="text-caption leading-4 text-state-fg-warning">
                A session is still running. Stop it before changing core settings.
              </p>
            )}
            {saveError && (
              <div className="flex items-start gap-2">
                <p role="alert" className="min-w-0 flex-1 text-caption leading-4 text-state-fg-danger">
                  {saveError}
                </p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tr("dismissSaveError")}
                  onClick={dismissSaveError}
                  className="text-text-faint hover:text-text-base"
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          {!draft ? (
            <div className="mx-auto w-full max-w-settings py-6">
              {settingsError ? (
                <div className="flex flex-col items-start gap-3">
                  <p role="alert" className="text-meta leading-5 text-state-fg-danger">
                    {settingsError}
                  </p>
                  <Button variant="outline" size="sm" onClick={reload}>
                    Retry
                  </Button>
                </div>
              ) : (
                <div role="status" aria-label={tr("loadingSettings")} className="flex flex-col gap-3">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="flex flex-col gap-2">
                      <div className="h-2 w-20 rounded-xs bg-bg-layer-03 motion-safe:animate-pulse" />
                      <div className="h-7 w-full rounded-md bg-bg-layer-01 motion-safe:animate-pulse" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            SECTIONS.map((item) => {
              const visible = item.id === section;
              const sectioned =
                item.id === "general" ||
                item.id === "models" ||
                item.id === "shortcuts" ||
                item.id === "notifications" ||
                item.id === "providers";
              return (
                <div
                  key={item.id}
                  data-settings-section={item.id}
                  aria-hidden={visible ? undefined : true}
                  inert={visible ? undefined : true}
                  className={`scroll-stable no-scrollbar absolute inset-0 overflow-y-auto ${visible ? "" : "invisible"}`}
                >
                  <div className={`w-full pb-20 ${sectioned ? "pt-8" : "pt-6"}`}>
                    {item.id === "general" && (
                      <GeneralSection preferences={{ preferences, save: savePreferences }} />
                    )}
                    {item.id === "appearance" && (
                      <AppearanceSection preferences={{ preferences, save: savePreferences }} />
                    )}
                    {item.id === "experimental" && (
                      <ExperimentalSection preferences={{ preferences, save: savePreferences }} />
                    )}
                    {item.id === "shortcuts" && (
                      <ShortcutsSection preferences={{ preferences, save: savePreferences }} />
                    )}
                    {item.id === "notifications" && (
                      <NotificationsSection preferences={{ preferences, save: savePreferences }} />
                    )}
                    {item.id === "projects" && (
                      <ProjectsSection
                        projects={workspaces}
                        initialProject={project}
                        onInitialProjectConsumed={onProjectConsumed}
                        onAdd={() => onAddWorkspace?.()}
                        onRemove={(path) => onRemoveWorkspace?.(path)}
                        preferences={preferences}
                        onSavePreferences={savePreferences}
                      />
                    )}
                    {item.id === "worktrees" && (
                      <WorktreesSection
                        workspace={workspace}
                        workspaces={workspaces}
                        sessionCounts={sessionCounts}
                      />
                    )}
                    {item.id === "extensions" && <ExtensionsSection workspace={workspace} />}
                    {item.id === "providers" && (
                      <ProvidersSection
                        scope={{ draft, busy, update, commit, updateAndCommit }}
                        preferences={preferences}
                        onSavePreferences={savePreferences}
                      />
                    )}
                    {item.id === "models" && (
                      <ModelsSection
                        scope={{ draft, busy, update, commit, updateAndCommit }}
                        onAddProvider={() => onSectionChange("providers")}
                      />
                    )}
                    {item.id === "servers" && (
                      <ServersSection
                        workspaces={workspaces}
                        onAdd={() => onAddWorkspace?.()}
                        onRemove={(path) => onRemoveWorkspace?.(path)}
                        onRestart={(path) => onRestartWorkspace?.(path)}
                      />
                    )}
                    {item.id === "about" && <AboutSection info={info} error={infoError} />}
                  </div>
                </div>
              );
            })
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}

