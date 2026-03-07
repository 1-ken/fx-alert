/**
 * Server-side cache for one-time tokens used to pass verify_otp result into NextAuth.
 * Tokens are single-use and short-lived (60s TTL).
 */

const TTL_MS = 60 * 1000; // 60 seconds

export interface CachedAuth {
  user: {
    id: string;
    name: string;
    phone: string;
    role: { id: string; name: string; rank: string };
    branch: { id: string; name: string; county_code: string };
  };
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

interface CacheEntry {
  data: CachedAuth;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function setOneTimeToken(data: CachedAuth): string {
  const token = generateToken();
  cache.set(token, {
    data,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

export function getAndDeleteOneTimeToken(token: string): CachedAuth | null {
  const entry = cache.get(token);
  cache.delete(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.data;
}
