/**
 * Server-side base URL for the observer (C++) API.
 *
 * Resolves automatically by probing candidates (no new env vars required):
 * 1. Optional OBSERVER_API_URL override (if you set it)
 * 2. Loopback http://127.0.0.1:8000 / localhost:8000
 * 3. http://<NEXT_PUBLIC host>:8000 (same host, direct port — skips Cloudflare)
 * 4. NEXT_PUBLIC_API_URL last (public URL; may hairpin through Cloudflare)
 *
 * Result is cached after the first successful /ping.
 */

let cachedBaseUrl: string | null = null;
let resolveInflight: Promise<string> | null = null;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function candidateList(): string[] {
  const out: string[] = [];
  const add = (raw?: string | null) => {
    const value = raw?.trim();
    if (!value) return;
    const cleaned = stripTrailingSlash(value);
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  add(process.env.OBSERVER_API_URL);
  add("http://127.0.0.1:8000");
  add("http://localhost:8000");

  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub) {
    try {
      const parsed = new URL(pub);
      if (
        parsed.hostname &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1"
      ) {
        // Direct to origin port on the same hostname (bypasses Cloudflare orange-cloud).
        add(`http://${parsed.hostname}:8000`);
      }
    } catch {
      // ignore invalid public URL
    }
    add(pub);
  }

  return out;
}

async function probeBaseUrl(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/ping`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(700),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveObserverServerBaseUrl(): Promise<string> {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  if (resolveInflight) {
    return resolveInflight;
  }

  resolveInflight = (async () => {
    for (const base of candidateList()) {
      if (await probeBaseUrl(base)) {
        cachedBaseUrl = base;
        return base;
      }
    }

    const fallback = stripTrailingSlash(
      process.env.NEXT_PUBLIC_API_URL?.trim() || "http://127.0.0.1:8000",
    );
    cachedBaseUrl = fallback;
    return fallback;
  })();

  try {
    return await resolveInflight;
  } finally {
    resolveInflight = null;
  }
}

/** Async: preferred. Probes once, then caches. */
export async function getObserverServerBaseUrl(): Promise<string> {
  return resolveObserverServerBaseUrl();
}
