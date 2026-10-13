/**
 * Small fetch wrapper: timeout, a descriptive User-Agent (NWS requires one),
 * and an in-memory TTL cache so the roster view doesn't hammer public APIs.
 */

const USER_AGENT =
  process.env.NWS_USER_AGENT ?? "preflight-checks/0.1 (github.com/Chiz-nn/Preflight-checks)";

type Entry = { expires: number; value: Promise<unknown> };
const cache = new Map<string, Entry>();

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function fetchCached<T>(
  url: string,
  opts: { ttlMs: number; parse: "json" | "text"; timeoutMs?: number; headers?: Record<string, string> },
): Promise<T> {
  const key = `${opts.parse}:${url}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = (async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new FetchError(`${res.status} ${res.statusText} from ${new URL(url).host}`, res.status);
    return opts.parse === "json" ? res.json() : res.text();
  })();

  cache.set(key, { expires: Date.now() + opts.ttlMs, value });
  // Never cache failures.
  value.catch(() => cache.delete(key));
  return value as Promise<T>;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return "timed out";
    return e.message;
  }
  return String(e);
}

/** Drop every cached response. Used by tests so one case's data can't leak into the next. */
export function clearCache(): void {
  cache.clear();
}
