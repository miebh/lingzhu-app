import { useEffect, useState } from "react";
import { Icon } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { SegmentedControl } from "@lingzhu/ui/segmented-control";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { t } from "@lingzhu/ui/i18n";
import type { MCPServer, PluginStatus, SkillSummary } from "@lingzhu/ui/types";

const TABS = ["mcps", "plugins", "skills"] as const;
type Tab = (typeof TABS)[number];

const TAB_OPTIONS = [
  { value: "mcps" as const, key: "mcpsTab" },
  { value: "plugins" as const, key: "plugins" },
  { value: "skills" as const, key: "skills" },
];

const EMPTY: Record<Tab, string> = {
  mcps: "emptyMcps",
  plugins: "emptyPlugins",
  skills: "emptySkills",
};

interface Props {
  workspace?: string;
}

/** Extensions page with the reference's pill tabs and catalog rows. */
export function ExtensionsSection({ workspace }: Props) {
  const [tab, setTab] = useState<Tab>("mcps");
  const [mcps, setMcps] = useState<MCPServer[]>([]);
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!workspace) return;
    let live = true;
    void Promise.all([api.mcpStatus(workspace), api.plugins(workspace), api.skills(workspace)])
      .then(([nextMcps, nextPlugins, nextSkills]) => {
        if (!live) return;
        setMcps(nextMcps ?? []);
        setPlugins(nextPlugins ?? []);
        setSkills(nextSkills ?? []);
        setError("");
      })
      .catch((cause) => {
        if (live) setError(messageOf(cause));
      });
    return () => {
      live = false;
    };
  }, [workspace]);

  const copyConfigPath = async () => {
    if (!workspace) return;
    try {
      const config = await api.coreConfig(workspace);
      if (!config.path) return;
      await navigator.clipboard.writeText(config.path);
      setNotice(t("configPathCopied"));
      window.setTimeout(() => setNotice(""), 1600);
    } catch {
      setNotice(t("configPathUnavailable"));
      window.setTimeout(() => setNotice(""), 1600);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        label="Extensions"
        value={tab}
        options={TAB_OPTIONS.map((item) => ({ value: item.value, label: t(item.key as never) }))}
        onChange={(value) => setTab(value)}
        className="w-fit"
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
            {t("availableAll")}
          </span>
          {tab === "skills" ? (
            <span className="text-body font-[440] leading-4 text-text-muted">{t("howToAddSkills")}</span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!workspace}
              onClick={() => void copyConfigPath()}
              className="px-0 text-body font-[440] text-text-accent hover:text-text-accent/80"
            >
              {t("manageConfig")}
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-meta leading-5 text-state-fg-danger">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          {tab === "mcps" &&
            mcps.map((server) => (
              <div
                key={server.name}
                className="flex min-h-14 items-center justify-between gap-3 border-b-[0.5px] border-border-base py-4 last:border-0"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Icon art="mcp" className="size-4 shrink-0 text-icon-muted" />
                  <span className="min-w-0 truncate text-body font-[530] leading-4 text-text-base">{server.name}</span>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-body font-[440] leading-4 text-text-muted">
                  <span className="size-1.5 rounded-full bg-state-fg-success" />
                  {t("connected")}
                </span>
              </div>
            ))}

          {tab === "plugins" &&
            plugins.map((plugin) => (
              <div
                key={plugin.name}
                className="flex min-h-14 items-center justify-between gap-3 border-b-[0.5px] border-border-base py-4 last:border-0"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Icon art="cube" className="size-4 shrink-0 text-icon-muted" />
                  <span className="min-w-0 truncate text-body font-[530] leading-4 text-text-base">{plugin.name}</span>
                </div>
              </div>
            ))}

          {tab === "skills" &&
            skills.map((skill) => (
              <div
                key={skill.id}
                className="flex min-h-14 items-center justify-between gap-3 border-b-[0.5px] border-border-base py-4 last:border-0"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Icon art="post-skill" className="size-4 shrink-0 text-icon-muted" />
                  <span className="min-w-0 truncate text-body font-[530] leading-4 text-text-base">{skill.name}</span>
                </div>
              </div>
            ))}

          {((tab === "mcps" && mcps.length === 0) ||
            (tab === "plugins" && plugins.length === 0) ||
            (tab === "skills" && skills.length === 0)) && (
            <p className="py-4 text-body font-[440] leading-4 text-text-muted">{t(EMPTY[tab] as never)}</p>
          )}
        </div>

        {notice && <p className="text-caption text-text-muted">{notice}</p>}
      </section>
    </div>
  );
}
