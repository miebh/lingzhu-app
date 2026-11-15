import { memo, type CSSProperties } from "react";

/**
 * Per-character shimmer used by pending tool titles. Each character carries its
 * own delayed peak layer, so the highlight travels across the text without
 * repainting a clipped background on every frame.
 */
export const TextShimmer = memo(function TextShimmer({
  text,
  active = false,
  className,
}: {
  text: string;
  active?: boolean;
  className?: string;
}) {
  if (!active) return <span className={className}>{text}</span>;
  return (
    <span data-component="text-shimmer" data-active="true" className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {Array.from(text).map((char, index) => (
          <span
            key={`${index}-${char}`}
            data-slot="text-shimmer-char"
            style={{ "--shimmer-index": index } as CSSProperties}
          >
            <span data-slot="text-shimmer-char-base">{char}</span>
            <span data-slot="text-shimmer-char-peak">{char}</span>
          </span>
        ))}
      </span>
    </span>
  );
});
