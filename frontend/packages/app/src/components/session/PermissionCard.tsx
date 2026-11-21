import { For, Show, createSignal } from "solid-js";
import { Warning } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import type { PermissionRequest } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  requests: PermissionRequest[];
  onReply: (requestID: string, decision: string, message?: string) => void;
}

/** The warning heading of one permission request. */
function PermissionHeader() {
  return (
    <div class="grid grid-cols-[20px_1fr] items-center gap-2">
      <Warning class="size-4 shrink-0 text-state-fg-warning" />
      <div class="min-w-0 text-body leading-5 font-[530] text-text-base">Permission required</div>
    </div>
  );
}

/** The hint, message and exact resources of one permission request. */
function PermissionDetails(props: { request: PermissionRequest }) {
  return (
    <div class="flex flex-col gap-1 pl-7">
      <p class="text-body leading-5 text-text-muted">{permissionHint(props.request.action)}</p>
      <Show when={props.request.message}>
        <p class="text-body leading-5 text-text-muted">{props.request.message}</p>
      </Show>
      <Show when={props.request.resources.length > 0}>
        <PermissionResources resources={props.request.resources} />
      </Show>
    </div>
  );
}

/** The resources the request would touch, one code line each. */
function PermissionResources(props: { resources: string[] }) {
  return (
    <div class="flex flex-col gap-1.5 pt-2 pb-4">
      <For each={props.resources}>
        {(resource) => (
          <code class="select-text font-mono text-body leading-5 break-all text-text-base">{resource}</code>
        )}
      </For>
    </div>
  );
}

/** The three stable answers for one permission request, plus a guided denial. */
function PermissionActions(props: { requestID: string; onReply: Props["onReply"] }) {
  const tr = useT();
  const [feedback, setFeedback] = createSignal("");
  const [correcting, setCorrecting] = createSignal(false);

  return (
    <Show
      when={correcting()}
      fallback={
        <div class="flex items-center justify-between gap-2 p-2">
          <div class="flex items-center gap-1">
            <Button variant="ghost" onClick={() => props.onReply(props.requestID, "reject")} class="px-3">
              {tr("permissionCardDeny")}
            </Button>
            <Button variant="ghost" onClick={() => setCorrecting(true)} class="px-3">
              {tr("permissionCardDenyWithNoteShort")}
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="neutral" onClick={() => props.onReply(props.requestID, "always")} class="px-3">
              {tr("dialogAllowAlways")}
            </Button>
            <Button variant="ghost" onClick={() => props.onReply(props.requestID, "once")} class="submit px-3">
              {tr("dialogAllowOnce")}
            </Button>
          </div>
        </div>
      }
    >
      <div class="flex flex-col gap-2 p-2">
        <label class="px-1 text-body leading-5 text-text-muted" for={`permission-feedback-${props.requestID}`}>
          {tr("permissionCardDenyWithNote")}
        </label>
        <input
          id={`permission-feedback-${props.requestID}`}
          autofocus
          value={feedback()}
          onInput={(event) => setFeedback(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && feedback().trim()) props.onReply(props.requestID, "reject", feedback().trim());
            if (event.key === "Escape") setCorrecting(false);
          }}
          placeholder={tr("permissionCardDenyHint")}
          class="min-w-0 rounded-md bg-bg-layer-01 px-2 py-1.5 text-body leading-5 text-text-base outline-none placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        />
        <div class="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setCorrecting(false)} class="px-3">
            {tr("cancel")}
          </Button>
          <Button
            variant="neutral"
            disabled={!feedback().trim()}
            onClick={() => props.onReply(props.requestID, "reject", feedback().trim())}
            class="px-3"
          >
            {tr("permissionCardSendDenial")}
          </Button>
        </div>
      </div>
    </Show>
  );
}

/** One permission request: what it wants, what it touches, and its answers. */
function PermissionRequestRow(props: { request: PermissionRequest; onReply: Props["onReply"] }) {
  return (
    <div class="flex flex-col">
      <div class="flex flex-col gap-4 p-3 pb-0">
        <PermissionHeader />
        <PermissionDetails request={props.request} />
      </div>
      <PermissionActions requestID={props.request.id} onReply={props.onReply} />
    </div>
  );
}

/**
 * A compact permission dock directly above the composer. It mirrors the tool
 * call's intent, shows the exact resources, and keeps the three answers in one
 * stable action row.
 */
export function PermissionCard(props: Props) {
  const tr = useT();
  return (
    <Show when={props.requests.length > 0}>
      <div class="select-none bg-bg-base pb-2">
        <div role="region" aria-label={tr("permissionCardPermissionRequests")} class="mx-auto w-full max-w-session px-3">
          <div class="flex flex-col overflow-clip rounded-xl bg-bg-base shadow-[var(--shadow-elevation-raised),0_0_0_0.5px_var(--color-bg-base)] dark:bg-bg-layer-01">
            <For each={props.requests}>
              {(request) => <PermissionRequestRow request={request} onReply={props.onReply} />}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}

function permissionHint(action: string): string {
  switch (action) {
    case "shell":
      return "Run this shell command?";
    case "read":
      return "Read this file?";
    case "edit":
      return "Edit this file?";
    case "glob":
      return "Search the workspace for files?";
    case "grep":
      return "Search the workspace for matching text?";
    case "webfetch":
      return "Fetch this URL?";
    case "skill":
      return "Load this skill?";
    case "subagent":
      return "Run this subagent?";
    case "question":
      return "Ask this question?";
    case "external_directory":
      return "Access a directory outside the workspace?";
    default:
      return `Allow ${action}?`;
  }
}
