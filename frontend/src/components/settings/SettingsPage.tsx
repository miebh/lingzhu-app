import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  Boxes,
  Check,
  CircleAlert,
  Cpu,
  Info,
  LoaderCircle,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { AppInfo, AppPreferences, WorkspaceInfo } from "../../lib/types";
import { AboutSection } from "./AboutSection";
import { AdvancedSection } from "./AdvancedSection";
import { AppearanceSection } from "./AppearanceSection";
import { GeneralSection } from "./GeneralSection";
import { ModelsSection } from "./ModelsSection";
import { PermissionsSection } from "./PermissionsSection";
import { ProvidersSection } from "./ProvidersSection";
import { useCoreConfig } from "./useCoreConfig";
import type { SaveState, SettingsSectionID } from "./types";

interface SectionItem {
  id: SettingsSectionID;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const GROUPS: { label: string; items: SectionItem[] }[] = [
  {
    label: "Preferences",
    items: [
      { id: "general", label: "General", description: "Startup behavior and permission shortcuts.", icon: SlidersHorizontal },
      { id: "appearance", label: "Appearance", description: "Type, spacing and motion on this machine.", icon: Palette },
    ],
  },
  {
    label: "Agent",
    items: [
      { id: "providers", label: "Providers", description: "Connected endpoints and the preset catalog.", icon: Boxes },
      { id: "models", label: "Models", description: "Model catalog and the default selection.", icon: Cpu },
      { id: "permissions", label: "Permissions", description: "Ordered rules judged before every tool call.", icon: ShieldCheck },
      { id: "advanced", label: "Advanced", description: "Core execution and shared files.", icon: Wrench },
    ],
  },
  {
    label: "System",
    items: [{ id: "about", label: "About", description: "Version and local paths.", icon: Info }],
  },
];

const SECTIONS = GROUPS.flatMap((group) => group.items);

interface Props {
  /** True while any session has a run in flight; core config writes are refused. */
  busy?: boolean;
  /** Active page; other parts of the app can deep-link into a section. */
  section: SettingsSectionID;
  onSectionChange: (section: SettingsSectionID) => void;
  workspaces: WorkspaceInfo[];
  preferences: AppPreferences;
  onSavePreferences: (preferences: AppPreferences) => Promise<void>;
  /** Receives the workspaces whose core was not restarted by this app. */
  onSaved: (reused: string[]) => void;
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
  preferences,
  onSavePreferences,
  onSaved,
}: Props) {
  const {
    draft,
    configPath,
    settingsError,
    saveState,
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

  return (
    <div className="flex min-h-0 flex-1 select-none p-2">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl bg-bg-base elevation-raised">
        <aside
          aria-label="Settings sections"
          className="w-settings-nav shrink-0 overflow-y-auto border-r border-border-base px-3 py-4 scroll-stable"
        >
          {GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1 pb-3">
              <div className="flex h-6 items-center px-2 text-caption text-text-faint">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const selected = item.id === section;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-selected={selected ? "true" : undefined}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => onSectionChange(item.id)}
                    className={`interactive group/nav flex h-control-sm w-full items-center gap-2 rounded-md px-2 text-left text-body ${
                      selected ? "bg-bg-layer-03 text-text-base" : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    <Icon
                      className={`size-4 shrink-0 ${
                        selected ? "text-text-accent" : "text-text-faint group-hover/nav:text-text-muted"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 flex-col gap-1 border-b border-border-base px-8 pt-8 pb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-[15px] font-[640] text-text-base">{active.label}</h1>
              <span className="flex-1" />
              <SaveIndicator state={saveState} />
            </div>
            <p className="text-body leading-5 text-text-muted">{active.description}</p>
          </header>

          {(busy || saveError) && (
            <div className="flex shrink-0 flex-col gap-1 border-b border-border-base px-8 py-2">
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
                  aria-label="Dismiss save error"
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
            <div className="mx-auto w-full max-w-settings px-8 py-6">
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
                <div role="status" aria-label="Loading settings" className="flex flex-col gap-3">
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
              return (
                <div
                  key={item.id}
                  data-settings-section={item.id}
                  aria-hidden={visible ? undefined : true}
                  inert={visible ? undefined : true}
                  className={`scroll-stable absolute inset-0 overflow-y-auto ${visible ? "" : "invisible"}`}
                >
                  <div className="mx-auto w-full max-w-settings px-8 py-6">
                    {item.id === "general" && (
                      <GeneralSection
                        preferences={{ preferences, save: savePreferences }}
                        scope={{ draft, busy, update, commit, updateAndCommit }}
                        workspaces={workspaces}
                      />
                    )}
                    {item.id === "appearance" && (
                      <AppearanceSection preferences={{ preferences, save: savePreferences }} />
                    )}
                    {item.id === "permissions" && (
                      <PermissionsSection scope={{ draft, busy, update, commit, updateAndCommit }} />
                    )}
                    {item.id === "providers" && (
                      <ProvidersSection scope={{ draft, busy, update, commit, updateAndCommit }} />
                    )}
                    {item.id === "models" && (
                      <ModelsSection
                        scope={{ draft, busy, update, commit, updateAndCommit }}
                        onAddProvider={() => onSectionChange("providers")}
                      />
                    )}
                    {item.id === "advanced" && (
                      <AdvancedSection scope={{ draft, busy, update, commit, updateAndCommit }} configPath={configPath} />
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
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-caption text-text-faint">
        <LoaderCircle className="size-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-caption text-state-fg-success">
        <Check className="size-3" />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-caption text-state-fg-danger">
        <CircleAlert className="size-3" />
        Save failed
      </span>
    );
  }
  return <span className="shrink-0 text-caption text-text-faint">Changes save automatically</span>;
}
