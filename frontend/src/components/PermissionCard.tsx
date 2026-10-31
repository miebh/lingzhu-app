import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PermissionRequest } from "../lib/types";

interface Props {
  requests: PermissionRequest[];
  onReply: (requestID: string, decision: string) => void;
}

export function PermissionCard({ requests, onReply }: Props) {
  if (requests.length === 0) return null;
  return (
    <div className="select-none border-t border-border-base bg-bg-layer-02 px-inset-page py-3">
      <div role="region" aria-label="Permission requests" className="mx-auto w-full max-w-chat divide-y divide-border-base">
        {requests.map((request) => (
          <div key={request.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-state-fg-warning" />

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-body text-text-base">
                <span>Permission required</span>
                <span className="font-mono text-meta text-text-muted">{request.action}</span>
              </div>
              {request.resources.length > 0 && (
                <div className="mt-1 select-text font-mono text-meta leading-5 break-all text-text-muted">
                  {request.resources.map((resource, index) => (
                    <div key={index}>{resource}</div>
                  ))}
                </div>
              )}
              {request.message && <p className="mt-1 text-meta leading-5 text-text-faint">{request.message}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-0.5">
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
  );
}
