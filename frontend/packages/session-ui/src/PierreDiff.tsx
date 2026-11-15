import { useEffect, useRef, type CSSProperties } from "react";
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
export function PierreDiff({ path, patch }: { path: string; patch: string }) {
  const scroll = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scroll.current;
    const wrapper = host.current;
    if (!root || !wrapper) return;
    const fileDiff = parseFileDiff(path, patch);
    if (!fileDiff) return;

    const virtual = lineCount(fileDiff) > VIRTUAL_LINE_LIMIT;
    const { instance, virtualizer } = createVirtualizedFileDiff(root, wrapper, virtual);
    wrapper.dataset.renderer = virtual ? "virtualized" : "plain";
    instance.render({ fileDiff, containerWrapper: wrapper, lineAnnotations: [] });
    return () => {
      try {
        instance.cleanUp();
      } catch {
        // A partial render can fail to clean up; the node is removed regardless.
      }
      virtualizer?.cleanUp();
      wrapper.replaceChildren();
    };
  }, [path, patch]);

  return (
    <div
      ref={scroll}
      data-slot="diff-scroll"
      data-pierre="true"
      style={pierreStyleVariables as CSSProperties}
    >
      <div
        ref={host}
        data-slot="diff-pierre"
        data-available={diffAvailable() ? "true" : "false"}
      />
    </div>
  );
}
