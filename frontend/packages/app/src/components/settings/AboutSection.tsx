import { createSignal, For, Show } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { LICENSE_TEXTS, NOTICES } from "./notices";
import type { AppInfo } from "@lingzhu/ui/types";
import { t } from "@lingzhu/ui/i18n";
import { Button } from "@lingzhu/ui/button";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";

interface Props {
  info?: AppInfo;
  error?: string;
}

/** Centered version, credits and notices, matching the reference About surface. */
export function AboutSection(props: Props) {
  const [notices, setNotices] = createSignal(false);
  const [installing, setInstalling] = createSignal(false);
  const [updateError, setUpdateError] = createSignal("");

  // Picking an installer the user downloaded is the only way to update: the
  // app has no server to ask for a build, and the installer itself decides
  // whether it can replace the running binaries.
  const installUpdate = async () => {
    setUpdateError("");
    let path: string;
    try {
      path = await api.pickInstaller(t("chooseInstallerTitle"));
    } catch (err) {
      setUpdateError(messageOf(err));
      return;
    }
    if (!path) return;
    setInstalling(true);
    try {
      await api.installUpdate(path);
    } catch (err) {
      setUpdateError(messageOf(err));
      setInstalling(false);
    }
  };

  return (
    <Show
      when={!props.error}
      fallback={
        <p
          role="alert"
          class="rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger"
        >
          {props.error}
        </p>
      }
    >
      <Show
        when={props.info}
        fallback={
          <div role="status" aria-label={t("loadingAppInfo")} class="flex flex-col gap-3">
            <For each={[0, 1, 2]}>
              {(index) => <div class="h-7 w-full rounded-md bg-bg-layer-01 motion-safe:animate-pulse" />}
            </For>
          </div>
        }
      >
        {(info) => (
          <div class="mx-auto flex w-full max-w-[560px] flex-col items-center gap-6 px-6 py-20 text-center">
            <div class="flex flex-col gap-3.5">
              <span class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                {t("versionLabel", { version: info().version })}
              </span>
              <p class="text-body font-[440] leading-5 text-text-muted">{t("licenseLine")}</p>
            </div>

            <div class="flex flex-col gap-1.5 text-body font-[440] leading-5 text-text-muted">
              <p>{t("contributorsLine")}</p>
              <p>{t("projectLine")}</p>
            </div>

            <div class="flex flex-col gap-1.5 text-body font-[440] leading-5 text-text-muted">
              <p>{t("websiteLine")}</p>
              <p>{t("trademarkLine")}</p>
              <button
                type="button"
                onClick={() => update(setNotices, notices, (value) => !value)}
                class="text-body font-[440] leading-5 text-text-accent underline-offset-2 hover:underline"
              >
                {t("thirdPartyNotices")}
              </button>
            </div>

            <div class="flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={installing()}
                onClick={() => void installUpdate()}
              >
                {installing() ? t("installingUpdate") : t("installUpdate")}
              </Button>
              <p class="max-w-[420px] text-caption leading-4 text-text-faint">
                {t("installUpdateHint")}
              </p>
              <Show when={updateError()}>
                <p role="alert" class="text-caption leading-4 text-state-fg-danger">
                  {updateError()}
                </p>
              </Show>
            </div>

            <Show when={notices()}>
              <div class="flex w-full flex-col gap-4 text-left">
                <For each={NOTICES}>
                  {(item) => (
                    <details class="rounded-md bg-bg-layer-01 px-4 py-3">
                      <summary class="flex cursor-pointer items-center justify-between gap-3 text-body font-[530] leading-4 text-text-base">
                        <span class="min-w-0 truncate">{item.name}</span>
                        <span class="shrink-0 font-mono text-caption text-text-faint">{item.license}</span>
                      </summary>
                      <pre class="mt-3 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-caption leading-5 text-text-muted select-text">
                        {LICENSE_TEXTS[item.license] ?? item.license}
                      </pre>
                    </details>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </Show>
  );
}
