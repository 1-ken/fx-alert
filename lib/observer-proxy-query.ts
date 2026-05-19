import { NextRequest } from "next/server";

export function buildObserverEndpointWithQuery(
  basePath: string,
  request: NextRequest
): string {
  const query = request.nextUrl.searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}
