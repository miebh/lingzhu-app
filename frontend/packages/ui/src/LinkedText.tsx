import { linkSegments } from "@lingzhu/ui/linked-text";

/** Plain text with every http(s) URL rendered as an external link. */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkSegments(text).map((segment, index) =>
        segment.href ? (
          <a key={index} data-slot="linked-text-link" href={segment.href} target="_blank" rel="noopener noreferrer">
            {segment.text}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
