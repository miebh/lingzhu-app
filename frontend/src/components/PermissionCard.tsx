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
    <div className="border-t border-border bg-raised px-8 py-3">
      <div className="mx-auto max-w-[736px] divide-y divide-border">
        {requests.map((request) => (
          <div key={request.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
            <TriangleAlert className="mt-[3px] size-4 shrink-0 text-warning" />

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-[13px] text-foreground">
                <span>Permission required</span>
                <span className="font-mono text-[12px] text-ink-mid">{request.action}</span>
              </div>
              {request.resources.length > 0 && (
                <div className="mt-1 space-y-0.5 font-mono text-[12px] leading-5 break-all text-ink-mid">
                  {request.resources.map((resource, index) => (
                    <div key={index}>{resource}</div>
                  ))}
                </div>
              )}
              {request.message && <p className="mt-1 text-[12px] leading-5 text-ink-weak">{request.message}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReply(request.id, "reject")}
                className="font-normal text-ink-mid hover:text-foreground"
              >
                Deny
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReply(request.id, "always")}
                className="font-normal text-ink-mid hover:text-foreground"
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
