import type { JSX } from "solid-js";
import { ErrorBoundary as SolidErrorBoundary, createSignal } from "solid-js";

/**
 * Keeps a render failure from turning the whole window black. The fallback is
 * intentionally plain: it must not depend on the stores or components that may
 * have failed.
 */
export function ErrorBoundary(props: { children?: JSX.Element }) {
  return (
    <SolidErrorBoundary
      fallback={(error: Error, reset) => {
        const [copied, setCopied] = createSignal(false);
        const details = [error ? `${error.name}: ${error.message}` : "Unknown error", error?.stack ?? ""]
          .filter(Boolean)
          .join("\n\n");
        const copy = async () => {
          try {
            await navigator.clipboard.writeText(details);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard access can be denied outside the Wails runtime.
          }
        };
        return (
          <div
            role="alert"
            class="flex h-full min-h-0 flex-col items-center justify-center gap-6 overflow-auto bg-bg-base px-6 py-12 text-center text-text-base"
          >
            <div class="flex max-w-xl flex-col gap-2">
              <h1 class="text-row font-semibold">Something went wrong</h1>
              <p class="text-body text-text-muted">
                The window hit an unexpected error. Reloading usually fixes it.
              </p>
            </div>

            <pre class="max-h-64 w-full max-w-2xl overflow-auto rounded-lg border border-border-base bg-bg-layer-01 p-4 text-left font-mono text-caption leading-5 text-text-muted select-text">
              {details}
            </pre>

            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                class="interactive inline-flex h-control-md items-center justify-center rounded-md border border-border-base px-3 text-body font-medium text-text-base"
              >
                {copied() ? "Copied" : "Copy details"}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                class="contrast inline-flex h-control-md items-center justify-center rounded-md border border-transparent px-3 text-body font-medium"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={reset}
                class="interactive inline-flex h-control-md items-center justify-center rounded-md border border-border-base px-3 text-body font-medium text-text-base"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
