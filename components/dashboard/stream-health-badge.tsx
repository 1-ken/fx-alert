"use client";

import { Badge } from "@/components/ui/badge";
import { useObserverHealth } from "@/hooks/streamHealth/use-stream-health";
import { useObserverServiceHealth } from "@/hooks/observer/use-service-health";

export function StreamHealthBadge() {
  const { data: streamHealth } = useObserverHealth();
  const { data: serviceHealth } = useObserverServiceHealth();

  const streamStatus = streamHealth?.status ?? "unknown";
  const apiStatus =
    typeof serviceHealth?.status === "string" ? serviceHealth.status : "unknown";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="rounded-full text-xs">
        Stream: {streamStatus}
      </Badge>
      <Badge variant="outline" className="rounded-full text-xs">
        API: {apiStatus}
      </Badge>
      {typeof streamHealth?.subscriber_count === "number" && (
        <Badge variant="secondary" className="rounded-full text-xs">
          {streamHealth.subscriber_count} subscribers
        </Badge>
      )}
    </div>
  );
}
