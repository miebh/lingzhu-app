import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
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
import type { AppInfo, AppPreferences, AppSettings, SettingsInput, WorkspaceInfo } from "../../lib/types";
import { AboutSection } from "./AboutSection";
import { AdvancedSection } from "./AdvancedSection";
import { AppearanceSection } from "./AppearanceSection";
import { GeneralSection } from "./GeneralSection";
import { ModelsSection } from "./ModelsSection";
import { PermissionsSection } from "./PermissionsSection";
import { ProvidersSection } from "./ProvidersSection";
import type { CoreDraft, SaveState } from "./types";

type SectionID = "general" | "appearance" | "providers" | "models" | "permissions" | "advanced" | "about";

interface SectionItem {
  id: SectionID;
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
export function SettingsPage({ busy = false, workspaces, preferences, onSavePreferences, onSaved }: Props) {
  const [section, setSection] = useState<SectionID>("general");
  const [draft, setDraft] = useState<CoreDraft>();
  const [configPath, setConfigPath] = useState("");
  const [settingsError, setSettingsError] = useState<string>();
  const [info, setInfo] = useState<AppInfo>();
  const [infoError, setInfoError] = useState<string>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  const draftRef = useRef<CoreDraft | undefined>(undefined);
  const savedKey = useRef("");
  const lastKey = useRef("");
  const queue = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    let alive = true;
    setDraft(undefined);
    setSettingsError(undefined);
    api
      .settings()
      .then((settings) => {
        if (!alive) return;
        const next = fromSettings(settings);
        draftRef.current = next;
        const key = serialize(next);
        savedKey.current = key;
        lastKey.current = key;
        setDraft(next);
        setConfigPath(settings.configPath);
      })
      .catch((cause) => {
        if (alive) setSettingsError(messageOf(cause));
      });

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
  }, [reloadKey]);

  // A successful save is acknowledged briefly instead of by a toast per field.
  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const queueSave = useCallback((next: CoreDraft) => {
    const result = toPayload(next);
    if (result.error) {
      lastKey.current = savedKey.current;
      setSaveState("error");
      setSaveError(result.error);
      return;
    }
    const key = JSON.stringify(result.payload);
    if (key === lastKey.current) return;
    lastKey.current = key;
    setSaveState("saving");
    setSaveError(undefined);

    queue.current = queue.current.then(async () => {
      try {
        const reused = await api.saveSettings(result.payload as SettingsInput);
        savedKey.current = key;
        setSaveState("saved");
        onSavedRef.current(reused);

        // Never keep a submitted key, a pending clear flag, or a stale ready
        // flag after the save succeeds.
        const current = draftRef.current;
        if (current) {
          let changed = false;
          const providers = current.providers.map((provider) => {
            const sent = next.providers.find((item) => item.id === provider.id);
            if (!sent) return provider;
            const hasKey = sent.apiKey.trim() !== "" || (provider.apiKeySet && !sent.clearKey);
            const ready = sent.baseUrl.trim() !== "" && (hasKey || sent.apiKeyEnv.trim() !== "" || sent.clearKey === false && provider.ready);
            const updated = {
              ...provider,
              apiKey: "",
              apiKeySet: hasKey,
              clearKey: false,
              ready,
            };
            if (
              updated.apiKey !== provider.apiKey ||
              updated.apiKeySet !== provider.apiKeySet ||
              updated.clearKey !== provider.clearKey ||
              updated.ready !== provider.ready
            ) {
              changed = true;
            }
            return updated;
          });
          if (changed) {
            const updated = { ...current, providers };
            draftRef.current = updated;
            setDraft(updated);
            const stable = serialize(updated);
            savedKey.current = stable;
            lastKey.current = stable;
          }
        }
      } catch (cause) {
        lastKey.current = savedKey.current;
        setSaveState("error");
        setSaveError(messageOf(cause));
      }
    });
  }, []);

  const update = useCallback((patch: Partial<CoreDraft>) => {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    draftRef.current = next;
    setDraft(next);
  }, []);

  const commit = useCallback(() => {
    const current = draftRef.current;
    if (current) queueSave(current);
  }, [queueSave]);

  const updateAndCommit = useCallback(
    (patch: Partial<CoreDraft>) => {
      const current = draftRef.current;
      if (!current) return;
      const next = { ...current, ...patch };
      draftRef.current = next;
      setDraft(next);
      queueSave(next);
    },
    [queueSave],
  );

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
                    onClick={() => setSection(item.id)}
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
                  onClick={() => setSaveError(undefined)}
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
                  <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>
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
                      <ModelsSection scope={{ draft, busy, update, commit, updateAndCommit }} />
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

function fromSettings(settings: AppSettings): CoreDraft {
  return {
    provider: settings.provider,
    model: settings.model,
    providers: settings.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: "",
      apiKeyEnv: provider.apiKeyEnv,
      apiKeySet: provider.apiKeySet,
      clearKey: false,
      ready: provider.ready,
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: String(model.contextWindow),
        enabled: model.enabled !== false,
      })),
    })),
    maxSteps: String(settings.maxSteps),
    contextWindow: String(settings.contextWindow),
    compactKeep: String(settings.compactKeep),
    systemPrompt: settings.systemPrompt,
    shell: (settings.shell ?? []).join(" "),
    permission: settings.permission.map((rule) => ({ ...rule })),
  };
}

function toPayload(draft: CoreDraft): { payload?: SettingsInput; error?: string } {
  const model = draft.model.trim();
  if (!model) return { error: "Model is required." };
  const maxSteps = Number(draft.maxSteps);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) return { error: "Max steps must be at least 1." };
  const contextWindow = Number(draft.contextWindow);
  if (!Number.isInteger(contextWindow) || contextWindow < 0) {
    return { error: "Context window cannot be negative." };
  }
  const compactKeep = Number(draft.compactKeep);
  if (!Number.isInteger(compactKeep) || compactKeep < 1) {
    return { error: "Compact keep must be at least 1." };
  }
  const permission = draft.permission.map((rule) => ({
    action: rule.action.trim(),
    resource: rule.resource.trim(),
    effect: rule.effect,
  }));
  for (const rule of permission) {
    if (!rule.action || !rule.resource) {
      return { error: "Every permission rule needs an action and a resource." };
    }
  }
  try {
    if (draft.providers.length === 0) return { error: "At least one provider is required." };

    const seenProvider = new Set<string>();
  const providers = draft.providers.map((provider) => {
    const id = provider.id.trim();
    if (!id) throw new Error("Every provider needs an id.");
    if (seenProvider.has(id)) throw new Error(`Provider ${id} is duplicated.`);
    seenProvider.add(id);
    const baseUrl = provider.baseUrl.trim();
    if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) {
      throw new Error(`Provider ${id} needs an absolute http(s) base URL.`);
    }
    const seenModel = new Set<string>();
    const models = provider.models.map((entry) => {
      const modelID = entry.id.trim();
      if (!modelID) throw new Error(`Provider ${id} has a model without an id.`);
      if (seenModel.has(modelID)) throw new Error(`Provider ${id} has duplicate model ${modelID}.`);
      seenModel.add(modelID);
      const window = Number(entry.contextWindow);
      if (!Number.isInteger(window) || window < 0) {
        throw new Error(`Model ${modelID} needs a non-negative context window.`);
      }
      return {
        id: modelID,
        name: entry.name.trim() || modelID,
        contextWindow: window,
        enabled: entry.enabled !== false,
      };
    });
    return {
      id,
      name: provider.name.trim() || id,
      baseUrl,
      apiKey: provider.apiKey.trim(),
      apiKeyEnv: provider.apiKeyEnv.trim(),
      clearKey: provider.clearKey,
      models,
    };
  });

  const selected = providers.find((provider) => provider.id === draft.provider);
  if (!selected) return { error: "Choose a default provider." };
  if (!selected.models.some((entry) => entry.id === model)) {
    return { error: `Provider ${selected.name} has no model ${model}.` };
  }

  return {
      payload: {
        provider: selected.id,
        model,
        providers,
        maxSteps,
        contextWindow,
        compactKeep,
        systemPrompt: draft.systemPrompt,
        shell: draft.shell.trim() === "" ? [] : draft.shell.trim().split(/\s+/),
        permission,
      },
    };
  } catch (error) {
    return { error: messageOf(error) };
  }
}

function serialize(draft: CoreDraft): string {
  const result = toPayload(draft);
  return result.payload ? JSON.stringify(result.payload) : "";
}
