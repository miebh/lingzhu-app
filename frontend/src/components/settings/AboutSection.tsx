import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsField, SettingsSection } from "./primitives";
import type { AppInfo } from "../../lib/types";

interface Props {
  info?: AppInfo;
  error?: string;
}

/** Version and the paths the app reads or writes. */
export function AboutSection({ info, error }: Props) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger">
        {error}
      </p>
    );
  }

  if (!info) {
    return (
      <div role="status" aria-label="Loading app info" className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-7 w-full rounded-md bg-bg-layer-01 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Version" description="lingzhu desktop client.">
        <SettingsField label="Client">
          <span className="font-mono text-body text-text-base select-text">{info.version}</span>
        </SettingsField>
        <SettingsField label="Built">
          <span className="font-mono text-meta text-text-muted select-text">{info.built || "Unknown"}</span>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Files" description="Everything the app reads or writes on this machine.">
        <PathField label="Core config" path={info.configPath} />
        <PathField label="Preferences" path={info.preferencesPath} />
        <PathField label="Data directory" path={info.dataDir} />
        <PathField label="App data" path={info.appDataDir} />
        <PathField label="Core log" path={info.logPath} />
      </SettingsSection>
    </div>
  );
}

function PathField({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied outside the Wails runtime; the path
      // stays selectable in that case.
    }
  };

  return (
    <SettingsField label={label}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 font-mono text-meta leading-5 break-all text-text-muted select-text">
          {path || "Unavailable"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
          className="shrink-0 text-text-faint hover:text-text-base"
        >
          {copied ? <Check className="text-state-fg-success" /> : <Copy />}
        </Button>
      </div>
    </SettingsField>
  );
}
