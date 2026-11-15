import { useState } from "react";
import { LICENSE_TEXTS, NOTICES } from "./notices";
import type { AppInfo } from "@lingzhu/ui/types";
import { t } from "@lingzhu/ui/i18n";

interface Props {
  info?: AppInfo;
  error?: string;
}

/** Centered version, credits and notices, matching the reference About surface. */
export function AboutSection({ info, error }: Props) {
  const [notices, setNotices] = useState(false);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger">
        {error}
      </p>
    );
  }

  if (!info) {
    return (
      <div role="status" aria-label={t("loadingAppInfo")} className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-7 w-full rounded-md bg-bg-layer-01 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-6 px-6 py-20 text-center">
      <div className="flex flex-col gap-3.5">
        <span className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
          {t("versionLabel", { version: info.version })}
        </span>
        <p className="text-body font-[440] leading-5 text-text-muted">
          {t("licenseLine")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 text-body font-[440] leading-5 text-text-muted">
        <p>{t("contributorsLine")}</p>
        <p>{t("projectLine")}</p>
      </div>

      <div className="flex flex-col gap-1.5 text-body font-[440] leading-5 text-text-muted">
        <p>{t("websiteLine")}</p>
        <p>{t("trademarkLine")}</p>
        <button
          type="button"
          onClick={() => setNotices((value) => !value)}
          className="text-body font-[440] leading-5 text-text-accent underline-offset-2 hover:underline"
        >
          {t("thirdPartyNotices")}
        </button>
      </div>

      {notices && (
        <div className="flex w-full flex-col gap-4 text-left">
          {NOTICES.map((item) => (
            <details key={item.name} className="rounded-md bg-bg-layer-01 px-4 py-3">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-body font-[530] leading-4 text-text-base">
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 font-mono text-caption text-text-faint">{item.license}</span>
              </summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-caption leading-5 text-text-muted select-text">
                {LICENSE_TEXTS[item.license] ?? item.license}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
