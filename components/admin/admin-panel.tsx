"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKenyaDateTime } from "@/lib/datetime";
import {
  ADMIN_TOKEN_KEY,
  getApiBase,
  useAdminActivity,
  useAdminAlerts,
  useAdminHealth,
  useAdminOverview,
  useAdminUsers,
} from "@/hooks/admin/use-admin-api";

type OverviewMetrics = {
  users_count: number;
  active_alerts: number;
  triggered_alerts: number;
  favorites_count: number;
  new_users_7d?: number;
  recent_activity_7d?: number;
  alerts_by_channel?: Record<string, number>;
  alerts_by_status?: Record<string, number>;
};

type AdminUserRow = {
  user_id: string;
  username: string;
  email: string | null;
  auth_provider: string;
  created_at: string | null;
  alert_count: number;
};

type AdminAlertRow = {
  id: string;
  user_id: string;
  username: string | null;
  email: string | null;
  created_by: string;
  pair: string;
  channel: string;
  status: string;
  alert_type: string;
  target_price: number | null;
  threshold: number | null;
  condition: string | null;
  created_at: string;
  triggered_at: string | null;
};

function formatAlertTarget(alert: AdminAlertRow): string {
  if (alert.alert_type === "candle_close") {
    return alert.threshold !== null ? String(alert.threshold) : "—";
  }
  return alert.target_price !== null ? String(alert.target_price) : "—";
}

type AdminActivityRow = {
  id: string;
  user_id: string | null;
  username: string | null;
  email: string | null;
  created_by: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function formatActivityDetails(row: AdminActivityRow): string {
  const parts: string[] = [];
  const { metadata } = row;

  if (typeof metadata.pair === "string") {
    parts.push(`pair: ${metadata.pair}`);
  }
  if (typeof metadata.alert_id === "string") {
    parts.push(`alert: ${metadata.alert_id.slice(0, 8)}…`);
  }
  if (typeof metadata.type === "string") {
    parts.push(`type: ${metadata.type}`);
  }
  if (row.ip_address) {
    parts.push(`ip: ${row.ip_address}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function AdminPanel() {
  const [phone, setPhone] = useState("+254707879716");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertStatus, setAlertStatus] = useState<string>("all");
  const [activityFilter, setActivityFilter] = useState<string>("all");

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (stored) {
      setToken(stored);
    }
  }, []);

  const loggedIn = Boolean(token);

  const { data: overview, mutate: refreshOverview } = useAdminOverview(loggedIn);
  const { data: usersPayload, mutate: refreshUsers } = useAdminUsers(loggedIn);
  const { data: alertsPayload, mutate: refreshAlerts } = useAdminAlerts(
    loggedIn,
    alertStatus === "all" ? undefined : alertStatus,
  );
  const { data: activityPayload, mutate: refreshActivity } = useAdminActivity(
    loggedIn,
    activityFilter === "all" ? undefined : activityFilter,
  );
  const { data: health } = useAdminHealth(loggedIn);

  const requestOtp = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(`${getApiBase()}/api/v1/admin/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        throw new Error("Could not send OTP");
      }
      setMessage("OTP sent via SMS");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send OTP");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(`${getApiBase()}/api/v1/admin/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (!response.ok) {
        throw new Error("Invalid OTP");
      }
      const payload = (await response.json()) as { access_token: string };
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, payload.access_token);
      setToken(payload.access_token);
      setMessage("Admin session started");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = () => {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setMessage(null);
  };

  const refreshAll = () => {
    void refreshOverview();
    void refreshUsers();
    void refreshAlerts();
    void refreshActivity();
  };

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              OTP is sent via SMS to the configured admin phone.
            </p>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
            <Button className="w-full" disabled={isSubmitting} onClick={requestOtp}>
              Send OTP
            </Button>
            <Input
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6-digit code"
              inputMode="numeric"
            />
            <Button
              className="w-full"
              disabled={isSubmitting || code.length < 6}
              onClick={verifyOtp}
            >
              Verify & enter
            </Button>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = overview as OverviewMetrics | undefined;
  const users = (usersPayload as { items?: AdminUserRow[] } | undefined)?.items ?? [];
  const alerts = ((alertsPayload as { items?: AdminAlertRow[] } | undefined)?.items ??
    []) as AdminAlertRow[];
  const activity = ((activityPayload as { items?: AdminActivityRow[] } | undefined)?.items ??
    []) as AdminActivityRow[];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">System admin</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAll}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {metrics ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">Users</p>
                  <p className="text-2xl font-semibold">{metrics.users_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">Active alerts</p>
                  <p className="text-2xl font-semibold">{metrics.active_alerts}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">Triggered</p>
                  <p className="text-2xl font-semibold">{metrics.triggered_alerts}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">Favorites</p>
                  <p className="text-2xl font-semibold">{metrics.favorites_count}</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extended metrics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-2">
              <p>New users (7d): {metrics?.new_users_7d ?? "—"}</p>
              <p>Activity events (7d): {metrics?.recent_activity_7d ?? "—"}</p>
              <p>
                By channel:{" "}
                {metrics?.alerts_by_channel
                  ? Object.entries(metrics.alerts_by_channel)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(", ")
                  : "—"}
              </p>
              <p>
                By status:{" "}
                {metrics?.alerts_by_status
                  ? Object.entries(metrics.alerts_by_status)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(", ")
                  : "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">System health</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p>Status: {(health as { status?: string } | undefined)?.status ?? "—"}</p>
              <pre className="mt-2 overflow-auto rounded-md bg-muted p-2 text-xs">
                {JSON.stringify((health as { checks?: unknown } | undefined)?.checks ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users loaded.</p>
              ) : (
                users.map((user) => (
                  <div key={user.user_id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{user.username}</p>
                    <p className="text-muted-foreground">
                      {user.auth_provider} · {user.alert_count} alerts
                    </p>
                    <p className="text-muted-foreground">
                      {user.email ?? "No email"} · Joined{" "}
                      {formatKenyaDateTime(user.created_at)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-3">
          <Select value={alertStatus} onValueChange={setAlertStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="triggered">Triggered</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All alerts</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {alerts.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No alerts.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Created by</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Triggered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.pair}</TableCell>
                        <TableCell className="capitalize">{row.status}</TableCell>
                        <TableCell className="capitalize">
                          {row.alert_type.replace("_", " ")}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatAlertTarget(row)}
                          {row.condition ? ` (${row.condition})` : ""}
                        </TableCell>
                        <TableCell>{row.channel}</TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {row.created_by ?? row.username ?? row.user_id ?? "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatKenyaDateTime(row.created_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {row.triggered_at ? formatKenyaDateTime(row.triggered_at) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-3">
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="login_success">Login success</SelectItem>
              <SelectItem value="login_failed">Login failed</SelectItem>
              <SelectItem value="register">Register</SelectItem>
              <SelectItem value="google_oauth">Google OAuth</SelectItem>
              <SelectItem value="alert_create">Alert create</SelectItem>
              <SelectItem value="alert_update">Alert update</SelectItem>
              <SelectItem value="alert_delete">Alert delete</SelectItem>
              <SelectItem value="favorite_add">Favorite add</SelectItem>
              <SelectItem value="favorite_remove">Favorite remove</SelectItem>
            </SelectContent>
          </Select>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity log</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {activity.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No activity logged yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.event_type}</TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {row.created_by ?? row.username ?? row.user_id ?? "Unknown"}
                          </span>
                          {row.email ? (
                            <span className="block text-xs text-muted-foreground">
                              {row.email}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatActivityDetails(row)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatKenyaDateTime(row.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
