import { useMemo } from "react";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import type { VCSFileDiff } from "@lingzhu/ui/types";
import { fileStatusLetter, fileStatusTone } from "@lingzhu/ui/status";

interface Props {
  files: VCSFileDiff[];
  selected?: string;
  /** Search results keep their incoming order instead of the depth-first tree order. */
  flat?: boolean;
  onSelect: (file: string) => void;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

function filenameOf(path: string): string {
  const normalized = normalize(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/**
 * Depth-first file order with directories before sibling files, exactly as the
 * reference change list sorts paths. The list stays flat: each row carries its
 * directory prefix instead of rendering folder rows.
 */
function sortPaths(files: VCSFileDiff[]): VCSFileDiff[] {
  const byPath = new Map<string, VCSFileDiff>();
  const directories = new Map<string, Set<string>>();
  const children = new Map<string, string[]>();

  const entry = (parent: string) => {
    if (!directories.has(parent)) directories.set(parent, new Set());
    if (!children.has(parent)) children.set(parent, []);
  };

  for (const file of files) {
    const path = normalize(file.file);
    byPath.set(path, file);
    const parts = path.split("/").filter(Boolean);
    let parent = "";
    for (let index = 0; index < parts.length - 1; index++) {
      const name = parts[index];
      entry(parent);
      directories.get(parent)!.add(name);
      parent = parent ? `${parent}/${name}` : name;
    }
    entry(parent);
    children.get(parent)!.push(path);
  }

  const ordered: VCSFileDiff[] = [];
  const visit = (parent: string) => {
    for (const name of [...(directories.get(parent) ?? [])].sort()) {
      visit(parent ? `${parent}/${name}` : name);
    }
    for (const path of [...(children.get(parent) ?? [])].sort()) {
      const file = byPath.get(path);
      if (file) ordered.push(file);
    }
  };
  visit("");
  return ordered;
}

/**
 * The review change list: 28px rows with a 16px file-type icon, a faint
 * directory prefix, the filename, and a 16px change letter at the end.
 */
export function ReviewFileTree({ files, selected, flat, onSelect }: Props) {
  const ordered = useMemo(() => {
    if (flat) return files;
    return sortPaths(files);
  }, [files, flat]);

  return (
    <div className="flex w-max min-w-full flex-col gap-0.5">
      {ordered.map((file) => {
        const name = filenameOf(file.file);
        const directory = file.file.slice(0, file.file.length - name.length);
        const active = file.file === selected;
        return (
          <button
            key={file.file}
            type="button"
            data-selected={active ? "true" : undefined}
            onClick={() => onSelect(file.file)}
            className="interactive flex h-7 min-w-max items-center gap-1.5 rounded-md pe-2 ps-2 text-text-muted hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] data-[selected=true]:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] data-[selected=true]:text-text-base"
          >
            <FileTypeIcon path={file.file} />
            <span className="flex min-w-0 items-center whitespace-nowrap">
              <span className="font-[530] text-[13px] leading-5 text-text-muted">{directory}</span>
              <span className="font-[530] text-[13px] leading-5 text-text-base">{name}</span>
            </span>
            <span
              className={`w-4 shrink-0 text-center text-caption leading-none font-[530] uppercase tabular-nums ${fileStatusTone(file.status)}`}
            >
              {fileStatusLetter(file.status)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
