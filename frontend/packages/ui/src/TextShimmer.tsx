import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

/**
 * Per-character shimmer used by pending tool titles. Each character carries its
 * own delayed peak layer, so the highlight travels across the text without
 * repainting a clipped background on every frame.
 */
export function TextShimmer(props: { text: string; active?: boolean; class?: string }) {
  return (
    <Show when={props.active} fallback={<span class={props.class}>{props.text}</span>}>
      <span data-component="text-shimmer" data-active="true" class={props.class}>
        <span class="sr-only">{props.text}</span>
        <span aria-hidden="true" class="inline-flex items-baseline">
          <For each={Array.from(props.text)}>
            {(char, index) => (
              <span
                data-slot="text-shimmer-char"
                style={{ "--shimmer-index": index() } as JSX.CSSProperties}
              >
                <span data-slot="text-shimmer-char-base">{char}</span>
                <span data-slot="text-shimmer-char-peak">{char}</span>
              </span>
            )}
          </For>
        </span>
      </span>
    </Show>
  );
}
