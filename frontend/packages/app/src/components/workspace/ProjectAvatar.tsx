import type { JSX } from "solid-js";
import { Icon } from "@lingzhu/ui/icons";

/**
 * The reference leaves an unconfigured project on the neutral gray avatar;
 * only a project's explicit icon color selects another variant.
 */
function projectIdentityStyle(_label: string | undefined): JSX.CSSProperties {
  return {
    background:
      "linear-gradient(180deg, var(--p-alpha-white-16) 0%, var(--p-alpha-white-0) 100%), var(--avatar-bg-gray)",
    "box-shadow": "inset 0 0 0 0.5px var(--avatar-border-gray)",
    color: "var(--avatar-fg)",
  };
}

function projectInitial(label: string | undefined): string {
  const value = label?.trim();
  if (!value) return "?";
  // Take the first code point, not the first UTF-16 unit: a name that starts
  // with an emoji or another astral character would otherwise be sliced in
  // half and render as a replacement glyph that reads like a stray "|".
  const first = Array.from(value)[0] ?? "";
  return first.toUpperCase();
}

const COLOR_STYLES: Record<string, JSX.CSSProperties> = {
  gray: {},
  blue: {
    background: "var(--bg-accent-soft)",
    color: "var(--fg-accent)",
    "box-shadow": "inset 0 0 0 0.5px var(--border-strong)",
  },
  green: {
    background: "color-mix(in oklch, var(--state-fg-success) 16%, transparent)",
    color: "var(--state-fg-success)",
    "box-shadow": "inset 0 0 0 0.5px var(--border-base)",
  },
  amber: {
    background: "color-mix(in oklch, var(--state-fg-warning) 16%, transparent)",
    color: "var(--state-fg-warning)",
    "box-shadow": "inset 0 0 0 0.5px var(--border-base)",
  },
  red: {
    background: "color-mix(in oklch, var(--state-fg-danger) 16%, transparent)",
    color: "var(--state-fg-danger)",
    "box-shadow": "inset 0 0 0 0.5px var(--border-base)",
  },
  violet: {
    background: "color-mix(in oklch, var(--state-fg-info) 16%, transparent)",
    color: "var(--state-fg-info)",
    "box-shadow": "inset 0 0 0 0.5px var(--border-base)",
  },
};

interface Props {
  name?: string;
  size?: "small" | "medium";
  class?: string;
  /** Artwork key rendered inside the tile instead of the initial. */
  icon?: string;
  /** Avatar color key; gray is the default. */
  color?: string;
}

/** A workspace/project avatar: a tinted letter or icon tile, like the reference badge. */
export function ProjectAvatar(props: Props) {
  return (
    <span
      aria-hidden="true"
      style={{ ...projectIdentityStyle(props.name), ...(COLOR_STYLES[props.color ?? "gray"] ?? {}) }}
      class={`grid shrink-0 place-items-center rounded-[4px] font-[530] leading-none tracking-[0.05px] tabular-nums uppercase [text-shadow:0_0_4px_var(--p-alpha-black-20)] ${
        (props.size ?? "small") === "medium" ? "size-5 text-[11px]" : "size-4 text-[11px]"
      } ${props.class ?? ""}`}
    >
      {props.icon ? <Icon art={props.icon} class="size-3" /> : projectInitial(props.name)}
    </span>
  );
}
