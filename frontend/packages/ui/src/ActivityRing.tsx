import type { CSSProperties } from "react";
import { cn } from "@lingzhu/ui/utils";
import { radarDots, radarKeyframes, radarLoop } from "@lingzhu/ui/radar";

const dots = radarDots();
const keyframes = "spinner-radar";
let installed = false;

/** The Soft Radar activity indicator used while a session is working. */
export function ActivityRing({ size = 14, className }: { size?: number; className?: string }) {
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
      className={cn("text-text-faint", className)}
      style={{ "--spinner-width": `${size}px`, "--spinner-height": `${size}px` } as CSSProperties}
    >
      {dots.map((dot, index) => (
        <svg
          key={index}
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
            } as CSSProperties
          }
        >
          <rect x={dot.x} y={dot.y} width={dot.size} height={dot.size} rx={dot.size * 0.24} />
        </svg>
      ))}
    </span>
  );
}

