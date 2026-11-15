import type { SVGProps } from "react";
import { cn } from "@lingzhu/ui/utils";

/**
 * The reference spinner: a 16px ring with a 20% track and a rotating 33% arc.
 * It defaults to the muted icon tone, as the reference loader does, and a
 * caller class can override the colour.
 */
export function Loader({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      className={cn("text-text-faint", className)}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-component="loader-v2"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        pathLength="100"
        strokeDasharray="33 67"
        strokeLinecap="round"
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}
