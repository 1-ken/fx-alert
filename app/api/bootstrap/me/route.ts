import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
        `Upstream observer unavailable at ${apiBaseUrl}/me (reverse-proxy 404). Restart the Dokploy ctraderplus service and confirm NEXT_PUBLIC_API_URL.`,
      );
      return NextResponse.json(
        {
          error:
            "Observer API is unreachable (upstream 404). Check NEXT_PUBLIC_API_URL and restart the backend on Dokploy.",
          upstream: `${apiBaseUrl}/me`,
        },
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

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load bootstrap data.",
      },
      { status: 500 },
    );
  }
}
