import { For } from "solid-js";
import { linkSegments } from "@lingzhu/ui/linked-text";

/** Plain text with every http(s) URL rendered as an external link. */
export function LinkedText(props: { text: string }) {
  return (
    <For each={linkSegments(props.text)}>
      {(segment) =>
        segment.href ? (
          <a data-slot="linked-text-link" href={segment.href} target="_blank" rel="noopener noreferrer">
            {segment.text}
          </a>
        ) : (
          <span>{segment.text}</span>
        )
      }
    </For>
  );
}
