/** A ring that fills clockwise from the top, used for context usage. */
export function ProgressCircle({
  percentage,
  size = 16,
  strokeWidth = 2,
  danger = false,
  className,
}: {
  /** 0–100; values outside the range are clamped. */
  percentage: number;
  size?: number;
  strokeWidth?: number;
  /** Paints the fill with the danger role once the budget is nearly spent. */
  danger?: boolean;
  className?: string;
}) {
  const value = Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      data-component="progress-circle"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="var(--color-bg-layer-04)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={danger ? "var(--color-state-fg-danger)" : "var(--color-icon-base)"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
