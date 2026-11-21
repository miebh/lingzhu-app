import { createEffect, onCleanup, type JSX } from "solid-js";
import {
  createVirtualizedFileDiff,
  diffAvailable,
  parseFileDiff,
  pierreStyleVariables,
} from "@lingzhu/session-ui/pierre";

/** Reference threshold for switching to the windowed diff renderer. */
const VIRTUAL_LINE_LIMIT = 200;

function lineCount(fileDiff: { hunks?: { splitLineCount?: number; unifiedLineCount?: number }[] }) {
  return (fileDiff.hunks ?? []).reduce(
    (total, hunk) => total + (hunk.splitLineCount ?? hunk.unifiedLineCount ?? 0),
    0,
  );
}

/**
 * Mounts the vendored Pierre diff web component. Long diffs use the reference
 * Virtualizer window; short diffs render through the plain FileDiff instance.
 */
export function PierreDiff(props: { path: string; patch: string }) {
  let scroll: HTMLDivElement | undefined;
  let host: HTMLDivElement | undefined;

  createEffect(() => {
    const root = scroll;
    const wrapper = host;
    const path = props.path;
    const patch = props.patch;
    if (!root || !wrapper) return;
    const fileDiff = parseFileDiff(path, patch);
    if (!fileDiff) return;

    const virtual = lineCount(fileDiff) > VIRTUAL_LINE_LIMIT;
    const { instance, virtualizer } = createVirtualizedFileDiff(root, wrapper, virtual);
    wrapper.dataset.renderer = virtual ? "virtualized" : "plain";
    instance.render({ fileDiff, containerWrapper: wrapper, lineAnnotations: [] });
    onCleanup(() => {
      try {
        instance.cleanUp();
      } catch {
        // A partial render can fail to clean up; the node is removed regardless.
      }
      virtualizer?.cleanUp();
      wrapper.replaceChildren();
    });
  });

  return (
    <div
      ref={(el) => (scroll = el)}
      data-slot="diff-scroll"
      data-pierre="true"
      style={pierreStyleVariables as JSX.CSSProperties}
    >
      <div
        ref={(el) => (host = el)}
        data-slot="diff-pierre"
        data-available={diffAvailable() ? "true" : "false"}
      />
    </div>
  );
}
