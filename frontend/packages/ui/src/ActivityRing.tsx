import type { JSX } from "solid-js";
import { For } from "solid-js";
import { cn } from "@lingzhu/ui/utils";
import { radarDots, radarKeyframes, radarLoop } from "@lingzhu/ui/radar";

const dots = radarDots();
const keyframes = "spinner-radar";
let installed = false;

/** The Soft Radar activity indicator used while a session is working. */
export function ActivityRing(props: { size?: number; class?: string }) {
  if (!installed && typeof document !== "undefined") {
    installed = true;
    const style = document.createElement("style");
    style.textContent = radarKeyframes(keyframes);
    document.head.append(style);
  }

  return (
    <span
      data-component="activity-ring"
      data-slot="spinner-dots"
      aria-hidden="true"
      class={cn("text-text-faint", props.class)}
      style={
        {
          "--spinner-width": `${props.size ?? 14}px`,
          "--spinner-height": `${props.size ?? 14}px`,
        } as JSX.CSSProperties
      }
    >
      <For each={dots}>
        {(dot) => (
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            style={
              {
                "--still": dot.still,
                animation: dot.steady
                  ? undefined
                  : `${keyframes}-${dot.shape} calc(${radarLoop}s * var(--spinner-time, 1)) linear calc(${
                      -radarLoop * (1 - dot.at)
                    }s * var(--spinner-time, 1)) infinite`,
              } as JSX.CSSProperties
            }
          >
            <rect x={dot.x} y={dot.y} width={dot.size} height={dot.size} rx={dot.size * 0.24} />
          </svg>
        )}
      </For>
    </span>
  );
}
