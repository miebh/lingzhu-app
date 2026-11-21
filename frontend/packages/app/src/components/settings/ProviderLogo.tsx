import { createMemo, Show } from "solid-js";
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
export function ProviderLogo(props: { id: string; name?: string; class?: string }) {
  const icon = createMemo(() => icons[props.id]);
  const label = () => props.class ?? "size-4";
  return (
    <Show
      when={icon()}
      fallback={
        <span class={`grid place-items-center text-caption font-medium ${label()}`} aria-hidden="true">
          {(Array.from((props.name || props.id).trim())[0] ?? "?").toUpperCase()}
        </span>
      }
    >
      {(current) => (
        <svg role="img" aria-label={current().title} viewBox="0 0 24 24" class={label()} fill="currentColor">
          <path d={current().path} />
        </svg>
      )}
    </Show>
  );
}
