import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "@lingzhu/ui/utils";

/**
 * The reference spinner: a 16px ring with a 20% track and a rotating 33% arc.
 * It defaults to the muted icon tone, as the reference loader does, and a
 * caller class can override the colour.
 */
export function Loader(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <svg
      {...rest}
      class={cn("text-text-faint", local.class)}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-component="loader-v2"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" opacity="0.2" />
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        stroke-width="2"
        path-length="100"
        stroke-dasharray="33 67"
        stroke-linecap="round"
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}
