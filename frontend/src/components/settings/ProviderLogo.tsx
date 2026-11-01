import {
  siDeepseek,
  siMistralai,
  siMoonshotai,
  siOllama,
  siOpenrouter,
  siQwen,
  siX,
} from "simple-icons";

const icons: Record<string, { path: string; title: string }> = {
  deepseek: siDeepseek,
  mistral: siMistralai,
  moonshot: siMoonshotai,
  kimi: siMoonshotai,
  ollama: siOllama,
  openrouter: siOpenrouter,
  qwen: siQwen,
  xai: siX,
};

/**
 * Provider mark: a brand glyph when the icon set has one, otherwise the
 * provider's initial. Kept monochrome so it inherits the surrounding text slot.
 */
export function ProviderLogo({ id, name, className = "size-4" }: { id: string; name?: string; className?: string }) {
  const icon = icons[id];
  if (icon) {
    return (
      <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d={icon.path} />
      </svg>
    );
  }
  return (
    <span className={`grid place-items-center text-caption font-medium ${className}`} aria-hidden>
      {(name || id).slice(0, 1).toUpperCase()}
    </span>
  );
}
