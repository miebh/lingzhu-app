import { type Accessor } from "solid-js";
import { createStore } from "./create";
import type { BatchExportItem } from "../lib/batchExport";
import type { SessionInfo, SessionSelection } from "@lingzhu/ui/types";

/** A dialog that names one workspace session; most surfaces share this payload. */
export interface SessionDialogTarget {
  workspace: string;
  sessionID: string;
  title: string;
  /** One skill to select when the skills dialog opens. */
  skillID?: string;
  /** Opens the skills dialog in its create form. */
  createSkill?: boolean;
}

/**
 * Every dialog the shell can open is one entry here, keyed by id. Dialog state
 * lives outside the shell component so opening one never re-renders the whole
 * app tree, and every caller (header, sidebar, palette, Home) opens it by id
 * instead of drilling a target setter through props.
 */
export type DialogEntry =
  | { id: "rename"; props: { workspace: string; session: SessionInfo } }
  | { id: "delete"; props: { workspace: string; session: SessionInfo } }
  | { id: "bulk-delete"; props: { items: SessionSelection[] } }
  | { id: "move"; props: { path: string; session: SessionInfo } }
  | { id: "bulk-move"; props: { items: SessionSelection[] } }
  | { id: "bulk-export"; props: { items: BatchExportItem[] } }
  | { id: "worktree"; props: { path: string } }
  | { id: "source-control"; props: { path: string } }
  | { id: "files"; props: { workspace: string; path?: string } }
  | { id: "schedules"; props: SessionDialogTarget }
  | { id: "artifacts"; props: { path: string } }
  | { id: "project"; props: { path: string } }
  | { id: "services"; props: { path: string } }
  | { id: "core"; props: { path: string } }
  | { id: "core-models"; props: { path: string } }
  | { id: "mcp"; props: { path: string; server?: string } }
  | { id: "plugins"; props: { path: string } }
  | { id: "search"; props: { path: string } }
  | { id: "live-events"; props: { path: string } }
  | { id: "jobs-overview"; props: { path: string } }
  | { id: "schedules-overview"; props: { path: string } }
  | { id: "usage-overview"; props: { path: string } }
  | { id: "web-search"; props: { path: string } }
  | { id: "image-gen"; props: { path: string } }
  | { id: "formatters"; props: { path: string } }
  | { id: "oauth"; props: { path: string } }
  | { id: "worktrees"; props: { path: string } }
  | { id: "share"; props: SessionDialogTarget }
  | { id: "pairing"; props: SessionDialogTarget }
  | { id: "media"; props: SessionDialogTarget }
  | { id: "usage"; props: SessionDialogTarget }
  | { id: "references"; props: SessionDialogTarget }
  | { id: "log"; props: SessionDialogTarget }
  | { id: "inbox"; props: SessionDialogTarget }
  | { id: "forms"; props: SessionDialogTarget }
  | { id: "jobs"; props: SessionDialogTarget }
  | { id: "skills"; props: SessionDialogTarget }
  | { id: "synthetic"; props: SessionDialogTarget }
  | { id: "run-command"; props: SessionDialogTarget }
  | { id: "wait"; props: SessionDialogTarget }
  | { id: "prompt-once"; props: SessionDialogTarget }
  | { id: "revert"; props: SessionDialogTarget & { text?: string } }
  | { id: "summary"; props: SessionDialogTarget & { text: string; loading: boolean; error: string } }
  | { id: "transfer"; props: { workspace: string; sessionID?: string; title?: string } }
  | { id: "environment"; props: SessionDialogTarget }
  | { id: "manage-models"; props: { connect: boolean } }
  | { id: "remove-workspace"; props: { path: string } }
  | { id: "palette"; props: Record<string, never> };

export type DialogID = DialogEntry["id"];

export type DialogEntryFor<K extends DialogID> = Extract<DialogEntry, { id: K }>;

interface DialogStore {
  /** One slot per id; opening a dialog twice replaces its payload. */
  entries: Partial<Record<DialogID, DialogEntry>>;
  open: (entry: DialogEntry) => void;
  close: (id: DialogID) => void;
  /** Updates the payload of an open dialog, e.g. a summary that is still loading. */
  patch: <K extends DialogID>(id: K, props: Partial<DialogEntryFor<K>["props"]>) => void;
}

export const useDialogStore = createStore<DialogStore>((set) => ({
  entries: {},

  open: (entry) => set((state) => ({ entries: { ...state.entries, [entry.id]: entry } })),

  close: (id) =>
    set((state) => {
      if (!(id in state.entries)) return state;
      const entries = { ...state.entries };
      delete entries[id];
      return { entries };
    }),

  patch: (id, props) =>
    set((state) => {
      const entry = state.entries[id];
      if (!entry) return state;
      return {
        entries: {
          ...state.entries,
          [id]: { ...entry, props: { ...entry.props, ...props } } as DialogEntry,
        },
      };
    }),
}));

/** Reads one dialog payload reactively; used by the dialog slot components. */
export function useDialogEntry<K extends DialogID>(id: K): Accessor<DialogEntryFor<K> | undefined> {
  return useDialogStore((state) => state.entries[id]) as Accessor<DialogEntryFor<K> | undefined>;
}

/** Stable helpers for callers outside components, such as stores and command builders. */
export function openDialog(entry: DialogEntry) {
  useDialogStore.getState().open(entry);
}

export function closeDialog(id: DialogID) {
  useDialogStore.getState().close(id);
}

/** `onOpenChange` handler that closes the dialog when it reports closed. */
export function dismissDialog(id: DialogID) {
  return (open: boolean) => {
    if (!open) closeDialog(id);
  };
}
