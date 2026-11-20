/**
 * The new-session wordmark. The reference draws its product name as eight
 * letterforms; this app shows its own name as text on the same centred slot so
 * the composer below keeps its position.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      data-slot="wordmark"
      className={`block text-center text-[56px] leading-none font-[530] tracking-[-0.04em] text-text-faint select-none ${className}`}
    >
      Lingzhu
    </span>
  );
}
