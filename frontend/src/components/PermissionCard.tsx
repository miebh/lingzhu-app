import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PermissionRequest } from "../lib/types";

interface Props {
  requests: PermissionRequest[];
  onReply: (requestID: string, decision: string) => void;
}

/**
 * A compact permission dock directly above the composer. It mirrors the tool
 * call's intent, shows the exact resources, and keeps the three answers in one
 * stable action row.
 */
export function PermissionCard({ requests, onReply }: Props) {
  if (requests.length === 0) return null;
  return (
    <div className="select-none bg-bg-base pb-2">
      <div role="region" aria-label="Permission requests" className="mx-auto w-full max-w-session px-3">
        <div className="divide-y divide-border-base overflow-clip rounded-xl bg-bg-layer-01 shadow-elevation-raised">
          {requests.map((request) => (
            <div key={request.id} className="flex flex-col">
              <div className="flex items-start gap-2 px-3 pt-3 pb-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-state-fg-warning" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-body font-medium text-text-base">Permission required</span>
                    <span className="min-w-0 truncate rounded-xs bg-bg-base px-1.5 py-0.5 font-mono text-caption text-text-muted">
                      {request.action}
                    </span>
                  </div>
                  <p className="mt-1 text-body leading-5 text-text-muted">{permissionHint(request.action)}</p>
                </div>
              </div>

              {request.resources.length > 0 && (
                <div className="px-3 pb-2">
                  <div className="flex flex-col gap-1 rounded-md bg-bg-base px-2 py-1.5">
                    {request.resources.map((resource, index) => (
                      <code key={index} className="select-text font-mono text-meta leading-5 break-all text-text-base">
                        {resource}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {request.message && <p className="px-3 pb-2 text-meta leading-5 text-text-faint">{request.message}</p>}

              <div className="flex items-center justify-end gap-2 border-t border-border-base px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onReply(request.id, "reject")}
                  className="font-normal text-text-muted hover:text-text-base"
                >
                  Deny
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReply(request.id, "always")}
                  className="font-normal text-text-muted hover:text-text-base"
                >
                  Allow always
                </Button>
                <Button size="sm" onClick={() => onReply(request.id, "once")}>
                  Allow once
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function permissionHint(action: string): string {
  switch (action) {
    case "bash":
      return "Run this shell command?";
    case "read_file":
      return "Read this file?";
    case "write_file":
      return "Write this file?";
    case "edit":
      return "Edit this file?";
    case "glob":
      return "Search the workspace for files?";
    case "grep":
      return "Search the workspace for matching text?";
    case "external_directory":
      return "Access a directory outside the workspace?";
    default:
      return `Allow ${action}?`;
  }
}
