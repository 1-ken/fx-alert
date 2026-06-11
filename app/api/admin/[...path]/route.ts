import type { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-api";

async function proxyAdmin(
  request: NextRequest,
  path: string[],
): Promise<Response> {
  const upstreamPath = `/api/v1/admin/${path.join("/")}${request.nextUrl.search}`;
  const auth = request.headers.get("Authorization");
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  return proxyAdminRequest(upstreamPath, {
    method: request.method,
    body,
    headers: auth ? { Authorization: auth } : undefined,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyAdmin(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyAdmin(request, path);
}
