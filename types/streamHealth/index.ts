export interface StreamHealth {
  status: "healthy" | "degraded" | "stale";
  stream_interval_seconds: number;
  snapshot_timeout_seconds: number;
  max_snapshot_failures: number;
  consecutive_snapshot_failures: number;
  last_snapshot_ts: string;
  last_snapshot_age_seconds: number;
  subscriber_count: number;
}
