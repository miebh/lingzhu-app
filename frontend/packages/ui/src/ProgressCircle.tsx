import { createMemo } from "solid-js";

/** A ring that fills clockwise from the top, used for context usage. */
export function ProgressCircle(props: {
  /** 0–100; values outside the range are clamped. */
  percentage: number;
  size?: number;
  strokeWidth?: number;
  /** Paints the fill with the danger role once the budget is nearly spent. */
  danger?: boolean;
  class?: string;
}) {
  const size = () => props.size ?? 16;
  const strokeWidth = () => props.strokeWidth ?? 2;
  const value = createMemo(() =>
    Number.isFinite(props.percentage) ? Math.min(100, Math.max(0, props.percentage)) : 0,
  );
  const radius = () => (size() - strokeWidth()) / 2;
  const circumference = () => 2 * Math.PI * radius();

  return (
    <svg
      data-component="progress-circle"
      width={size()}
      height={size()}
      viewBox={`0 0 ${size()} ${size()}`}
      fill="none"
      aria-hidden="true"
      class={props.class}
    >
      <circle
        cx={size() / 2}
        cy={size() / 2}
        r={radius()}
        stroke="var(--color-bg-layer-04)"
        stroke-width={strokeWidth()}
      />
      <circle
        cx={size() / 2}
        cy={size() / 2}
        r={radius()}
        stroke={props.danger ? "var(--color-state-fg-danger)" : "var(--color-icon-base)"}
        stroke-width={strokeWidth()}
        stroke-linecap="round"
        stroke-dasharray={`${(circumference() * value()) / 100} ${circumference()}`}
        transform={`rotate(-90 ${size() / 2} ${size() / 2})`}
      />
    </svg>
  );
}
