import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";
import { getObserverServerBaseUrl } from "@/lib/observer-server-url";

function isDeadUpstream(status: number, body: string, contentType: string): boolean {
  if (status !== 404) return false;
  const normalized = body.trim().toLowerCase();
  // Traefik / reverse-proxy default when no service is routed
  if (normalized === "404 page not found") return true;
  if (!contentType.includes("application/json") && normalized.includes("404 page not found")) {
    return true;
  }
  return false;
}

function isCloudflareTimeoutHtml(status: number, body: string, contentType: string): boolean {
  if (status !== 524 && status !== 502 && status !== 504) return false;
  if (contentType.includes("application/json")) return false;
  return body.includes("Error code 524") || body.includes("cloudflare");
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiBaseUrl = await getObserverServerBaseUrl();
    const response = await apiFetch(`${apiBaseUrl}/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken || ""}`,
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "application/json";
    const body = await response.text();

    if (isDeadUpstream(response.status, body, contentType)) {
      console.error(
        "Upstream observer unavailable (reverse-proxy 404). Set OBSERVER_API_URL to the internal service and restart the observer.",
      );
      return NextResponse.json(
        {
          error:
            "Observer API is unreachable. Check OBSERVER_API_URL (internal) and restart the backend.",
        },
        { status: 502 },
      );
    }

    if (isCloudflareTimeoutHtml(response.status, body, contentType)) {
      console.error(
        "Upstream observer timed out via proxy (Cloudflare 524). Prefer OBSERVER_API_URL pointing at the private service, not the public hostname.",
      );
      return NextResponse.json(
        {
          error:
            "Observer API timed out. Use an internal OBSERVER_API_URL and check the ctraderplus service.",
        },
        { status: 504 },
      );
    }

    // Never forward raw HTML error pages to the browser.
    if (!contentType.includes("application/json") && body.trimStart().startsWith("<!")) {
      console.error("Upstream observer returned non-JSON error page", response.status);
      return NextResponse.json(
        { error: "Observer API returned an unexpected error." },
        { status: 502 },
      );
    }

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Failed to proxy /me", error);

    const message = error instanceof Error ? error.message : "";
    const timedOut =
      message.includes("TimeoutError") ||
      message.includes("aborted") ||
      message.includes("timeout");

    return NextResponse.json(
      {
        error: timedOut
          ? "Observer API timed out. Check the backend and OBSERVER_API_URL."
          : "Failed to load bootstrap data.",
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
