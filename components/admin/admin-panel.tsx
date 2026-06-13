"use client";

import { useEffect, useMemo, useState } from "react";
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
import { getDefaultAdminPhone, normalizeAdminPhone } from "@/lib/admin-config";
import { formatKenyaDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  ADMIN_TOKEN_KEY,
  useAdminActivity,
  useAdminAlerts,
  useAdminFeedback,
  useAdminHealth,
  useAdminMarketers,
  useAdminOverview,
  useAdminUsers,
  createMarketer,
  updateMarketer,
} from "@/hooks/admin/use-admin-api";
import { buildMarketerReferralLink } from "@/lib/referral";
import {
  ACTIVITY_DATE_PRESET_LABELS,
  type ActivityDatePreset,
  detectActivityDatePreset,
  getActivityDateRange,
  getDefaultActivityDateRange,
} from "@/lib/admin-activity-dates";
import { DateRangePicker } from "@/components/ui/date-range-picker";

type OverviewMetrics = {
  users_count: number;
  active_alerts: number;
  triggered_alerts: number;
  favorites_count: number;
  new_users_7d?: number;
  recent_activity_7d?: number;
  alerts_by_channel?: Record<string, number>;
  alerts_by_status?: Record<string, number>;
  referrals_by_marketer?: Record<string, number>;
};

type AdminUserRow = {
  user_id: string;
  username: string;
  email: string | null;
  auth_provider: string;
  created_at: string | null;
  referred_by_marketer_code: string | null;
  marketer_name: string | null;
  alert_count: number;
  active_alerts: number;
  triggered_alerts: number;
  favorites_count: number;
  activity_count: number;
  last_login_at: string | null;
};

type AdminMarketerRow = {
  code: string;
  name: string;
  active: boolean;
  created_at: string;
  referral_count: number;
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

type AdminFeedbackRow = {
  id: string;
  user_id: string;
  username: string;
  email: string | null;
  enjoying: boolean;
  improvements: string | null;
  source: string;
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

async function readAdminApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function formatAdminRequestError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return "Cannot reach API. Ensure ctraderplus_server is running on port 8000.";
  }
  return error instanceof Error ? error.message : fallback;
}

export function AdminPanel() {
  const [phone, setPhone] = useState(getDefaultAdminPhone);
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [alertStatus, setAlertStatus] = useState<string>("all");
  const defaultActivityDates = getDefaultActivityDateRange();
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [activityDatePreset, setActivityDatePreset] =
    useState<ActivityDatePreset>("today");
  const [activityStartDate, setActivityStartDate] = useState(defaultActivityDates.start);
  const [activityEndDate, setActivityEndDate] = useState(defaultActivityDates.end);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newMarketerCode, setNewMarketerCode] = useState("");
  const [newMarketerName, setNewMarketerName] = useState("");
  const [marketerMessage, setMarketerMessage] = useState<string | null>(null);

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
    selectedUserId,
    activityStartDate || null,
    activityEndDate || null,
  );
  const { data: health } = useAdminHealth(loggedIn);
  const { data: marketersPayload, mutate: refreshMarketers } = useAdminMarketers(loggedIn);
  const { data: feedbackPayload, mutate: refreshFeedback } = useAdminFeedback(loggedIn);

  const requestOtp = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizeAdminPhone(phone) }),
      });
      if (!response.ok) {
        const detail = await readAdminApiError(response, "Could not send OTP");
        throw new Error(detail);
      }
      setMessage("OTP sent via SMS");
    } catch (error) {
      setMessage(formatAdminRequestError(error, "Failed to send OTP"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizeAdminPhone(phone), code }),
      });
      if (!response.ok) {
        const detail = await readAdminApiError(response, "Invalid OTP");
        throw new Error(detail);
      }
      const payload = (await response.json()) as { access_token: string };
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, payload.access_token);
      setToken(payload.access_token);
      setMessage("Admin session started");
    } catch (error) {
      setMessage(formatAdminRequestError(error, "Verification failed"));
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
    void refreshMarketers();
    void refreshFeedback();
  };

  const metrics = overview as OverviewMetrics | undefined;
  const users = (usersPayload as { items?: AdminUserRow[] } | undefined)?.items ?? [];
  const alerts = ((alertsPayload as { items?: AdminAlertRow[] } | undefined)?.items ??
    []) as AdminAlertRow[];
  const feedback = ((feedbackPayload as { items?: AdminFeedbackRow[] } | undefined)?.items ??
    []) as AdminFeedbackRow[];
  const activity = ((activityPayload as { items?: AdminActivityRow[] } | undefined)?.items ??
    []) as AdminActivityRow[];
  const marketers =
    (marketersPayload as { items?: AdminMarketerRow[] } | undefined)?.items ?? [];

  const selectedUserLabel = useMemo(() => {
    if (!selectedUserId) {
      return null;
    }
    const user = users.find((row) => row.user_id === selectedUserId);
    return user?.username || user?.email || selectedUserId;
  }, [selectedUserId, users]);

  const openUserActivity = (userId: string) => {
    setSelectedUserId(userId);
    setActiveTab("activity");
  };

  const applyActivityDatePreset = (preset: Exclude<ActivityDatePreset, "custom">) => {
    const range = getActivityDateRange(preset);
    setActivityDatePreset(preset);
    setActivityStartDate(range.start);
    setActivityEndDate(range.end);
  };

  const handleActivityDateChange = (from?: string, to?: string) => {
    if (!from || !to) {
      applyActivityDatePreset("today");
      return;
    }
    setActivityStartDate(from);
    setActivityEndDate(to);
    setActivityDatePreset(detectActivityDatePreset(from, to));
  };

  const handleCreateMarketer = async () => {
    setIsSubmitting(true);
    setMarketerMessage(null);
    try {
      await createMarketer(newMarketerCode.trim().toLowerCase(), newMarketerName.trim());
      setNewMarketerCode("");
      setNewMarketerName("");
      setMarketerMessage("Marketer created");
      void refreshMarketers();
      void refreshOverview();
    } catch (error) {
      setMarketerMessage(formatAdminRequestError(error, "Failed to create marketer"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleMarketer = async (marketer: AdminMarketerRow) => {
    setMarketerMessage(null);
    try {
      await updateMarketer(marketer.code, { active: !marketer.active });
      void refreshMarketers();
    } catch (error) {
      setMarketerMessage(formatAdminRequestError(error, "Failed to update marketer"));
    }
  };

  const handleCopyReferralLink = async (code: string) => {
    const link = buildMarketerReferralLink(window.location.origin, code);
    try {
      await navigator.clipboard.writeText(link);
      setMarketerMessage(`Copied link for ${code}`);
    } catch {
      setMarketerMessage(link);
    }
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="marketers">Marketers</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
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
              <p>
                Referrals by marketer:{" "}
                {metrics?.referrals_by_marketer
                  ? Object.entries(metrics.referrals_by_marketer)
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
              <CardTitle className="text-base">Users</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {users.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No users loaded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Marketer</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Alerts</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Triggered</TableHead>
                      <TableHead>Favorites</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Last login</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow
                        key={user.user_id}
                        className={cn(
                          selectedUserId === user.user_id && "bg-accent/40",
                        )}
                      >
                        <TableCell>
                          <span className="font-medium">{user.username || "—"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {user.email ?? "No email"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {user.referred_by_marketer_code ? (
                            <span>
                              {user.marketer_name ?? user.referred_by_marketer_code}
                              {user.marketer_name ? (
                                <span className="block text-xs text-muted-foreground">
                                  {user.referred_by_marketer_code}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="capitalize">{user.auth_provider}</TableCell>
                        <TableCell>{user.alert_count}</TableCell>
                        <TableCell>{user.active_alerts ?? 0}</TableCell>
                        <TableCell>{user.triggered_alerts ?? 0}</TableCell>
                        <TableCell>{user.favorites_count ?? 0}</TableCell>
                        <TableCell>{user.activity_count ?? 0}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {user.last_login_at
                            ? formatKenyaDateTime(user.last_login_at)
                            : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatKenyaDateTime(user.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openUserActivity(user.user_id)}
                          >
                            View activity
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Use View activity to inspect a user&apos;s event history.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create marketer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input
                value={newMarketerCode}
                onChange={(event) =>
                  setNewMarketerCode(
                    event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                  )
                }
                placeholder="Code (e.g. alice)"
              />
              <Input
                value={newMarketerName}
                onChange={(event) => setNewMarketerName(event.target.value)}
                placeholder="Display name"
              />
              <Button
                disabled={
                  isSubmitting ||
                  newMarketerCode.length < 3 ||
                  newMarketerName.trim().length === 0
                }
                onClick={handleCreateMarketer}
              >
                Add marketer
              </Button>
            </CardContent>
          </Card>

          {marketerMessage ? (
            <p className="text-sm text-muted-foreground">{marketerMessage}</p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marketers</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {marketers.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No marketers yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Referrals</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketers.map((marketer) => (
                      <TableRow key={marketer.code}>
                        <TableCell className="font-mono">{marketer.code}</TableCell>
                        <TableCell>{marketer.name}</TableCell>
                        <TableCell>{marketer.active ? "Yes" : "No"}</TableCell>
                        <TableCell>{marketer.referral_count}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatKenyaDateTime(marketer.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyReferralLink(marketer.code)}
                            >
                              Copy link
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleMarketer(marketer)}
                            >
                              {marketer.active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
          {selectedUserId ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Activity for{" "}
                <span className="font-medium text-foreground">{selectedUserLabel}</span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectedUserId(null)}
              >
                Clear filter
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Select
              value={selectedUserId ?? "all"}
              onValueChange={(value) =>
                setSelectedUserId(value === "all" ? null : value)
              }
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.username || user.email || user.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <div className="flex flex-wrap items-center gap-2">
              {(["today", "this_week", "this_month"] as const).map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={activityDatePreset === preset ? "default" : "outline"}
                  onClick={() => applyActivityDatePreset(preset)}
                >
                  {ACTIVITY_DATE_PRESET_LABELS[preset]}
                </Button>
              ))}
              <DateRangePicker
                dateFrom={activityStartDate}
                dateTo={activityEndDate}
                onDateChange={handleActivityDateChange}
                className="w-[280px]"
              />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedUserId ? "User activity log" : "Activity log"}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {activity.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  {selectedUserId ||
                  activityDatePreset !== "today" ||
                  activityFilter !== "all"
                    ? "No activity matches the current filters."
                    : "No activity logged yet."}
                </p>
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

        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">User feedback</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {feedback.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No feedback yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Enjoying</TableHead>
                      <TableHead>Improvements</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedback.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatKenyaDateTime(row.created_at)}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {row.username || row.email || row.user_id}
                          </span>
                          {row.email ? (
                            <span className="block text-xs text-muted-foreground">{row.email}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              row.enjoying
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-destructive/15 text-destructive",
                            )}
                          >
                            {row.enjoying ? "Yes" : "No"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-md text-sm text-muted-foreground">
                          {row.improvements?.trim() ? row.improvements : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.source}</TableCell>
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
