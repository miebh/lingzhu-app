import { Warning } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import type { PermissionRequest } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";
import { useState } from "react";

interface Props {
  requests: PermissionRequest[];
  onReply: (requestID: string, decision: string, message?: string) => void;
}

/** The warning heading of one permission request. */
function PermissionHeader() {
  return (
    <div className="grid grid-cols-[20px_1fr] items-center gap-2">
      <Warning className="size-4 shrink-0 text-state-fg-warning" />
      <div className="min-w-0 text-body leading-5 font-[530] text-text-base">Permission required</div>
    </div>
  );
}

/** The hint, message and exact resources of one permission request. */
function PermissionDetails({ request }: { request: PermissionRequest }) {
  return (
    <div className="flex flex-col gap-1 pl-7">
      <p className="text-body leading-5 text-text-muted">{permissionHint(request.action)}</p>
      {request.message && <p className="text-body leading-5 text-text-muted">{request.message}</p>}
      {request.resources.length > 0 && (
        <PermissionResources resources={request.resources} />
      )}
    </div>
  );
}

/** The resources the request would touch, one code line each. */
function PermissionResources({ resources }: { resources: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 pt-2 pb-4">
      {resources.map((resource, index) => (
        <code key={index} className="select-text font-mono text-body leading-5 break-all text-text-base">
          {resource}
        </code>
      ))}
    </div>
  );
}

/** The three stable answers for one permission request, plus a guided denial. */
function PermissionActions({
  requestID,
  onReply,
}: {
  requestID: string;
  onReply: Props["onReply"];
}) {
  const tr = useT();
  const [feedback, setFeedback] = useState("");
  const [correcting, setCorrecting] = useState(false);
  if (correcting) {
    return (
      <div className="flex flex-col gap-2 p-2">
        <label className="px-1 text-body leading-5 text-text-muted" htmlFor={`permission-feedback-${requestID}`}>
          {tr("permissionCardDenyWithNote")}
        </label>
        <input
          id={`permission-feedback-${requestID}`}
          autoFocus
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && feedback.trim()) onReply(requestID, "reject", feedback.trim());
            if (event.key === "Escape") setCorrecting(false);
          }}
          placeholder={tr("permissionCardDenyHint")}
          className="min-w-0 rounded-md bg-bg-layer-01 px-2 py-1.5 text-body leading-5 text-text-base outline-none placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setCorrecting(false)} className="px-3">
            {tr("cancel")}
          </Button>
          <Button
            variant="neutral"
            disabled={!feedback.trim()}
            onClick={() => onReply(requestID, "reject", feedback.trim())}
            className="px-3"
          >
            {tr("permissionCardSendDenial")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 p-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => onReply(requestID, "reject")} className="px-3">
          {tr("permissionCardDeny")}
        </Button>
        <Button variant="ghost" onClick={() => setCorrecting(true)} className="px-3">
          {tr("permissionCardDenyWithNoteShort")}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="neutral" onClick={() => onReply(requestID, "always")} className="px-3">
          {tr("dialogAllowAlways")}
        </Button>
        <Button variant="ghost" onClick={() => onReply(requestID, "once")} className="submit px-3">
          {tr("dialogAllowOnce")}
        </Button>
      </div>
    </div>
  );
}

/** One permission request: what it wants, what it touches, and its answers. */
function PermissionRequestRow({
  request,
  onReply,
}: {
  request: PermissionRequest;
  onReply: Props["onReply"];
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 p-3 pb-0">
        <PermissionHeader />
        <PermissionDetails request={request} />
      </div>
      <PermissionActions requestID={request.id} onReply={onReply} />
    </div>
  );
}

/**
 * A compact permission dock directly above the composer. It mirrors the tool
 * call's intent, shows the exact resources, and keeps the three answers in one
 * stable action row.
 */
export function PermissionCard({ requests, onReply }: Props) {
  const tr = useT();
  if (requests.length === 0) return null;
  return (
    <div className="select-none bg-bg-base pb-2">
      <div role="region" aria-label={tr("permissionCardPermissionRequests")} className="mx-auto w-full max-w-session px-3">
        <div className="flex flex-col overflow-clip rounded-xl bg-bg-base shadow-[var(--shadow-elevation-raised),0_0_0_0.5px_var(--color-bg-base)] dark:bg-bg-layer-01">
          {requests.map((request) => (
            <PermissionRequestRow key={request.id} request={request} onReply={onReply} />
          ))}
        </div>
      </div>
    </div>
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
