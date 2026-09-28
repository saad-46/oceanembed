/**
 * Shared request cache for `useApi`.
 *
 * Several components on one page ask for the same resource (the sidebar status block and the top
 * bar both read `/health`; the shell and screens both read `/v1/meta`). Without sharing, each mount
 * fired its own request. Here, concurrent callers share one in-flight promise and a successful
 * result is reused for a short TTL. Errors are never cached, and `force` (used by Retry) always
 * goes back to the network, so independent refresh still works.
 */
type Entry = { at: number; data: unknown };

const inflight = new Map<string, Promise<unknown>>();
const results = new Map<string, Entry>();
const MAX_ENTRIES = 200;

/** Status endpoints must stay fresh; data endpoints are immutable reconstructions. */
export function ttlFor(key: string): number {
  return key.startsWith("/health") ? 15_000 : 5 * 60_000;
}

export function cachedRequest<T>(key: string, fetcher: () => Promise<T>, opts: { force?: boolean; now?: number } = {}): Promise<T> {
  const now = opts.now ?? Date.now();
  if (!opts.force) {
    const hit = results.get(key);
    if (hit && now - hit.at < ttlFor(key)) return Promise.resolve(hit.data as T);
    const flying = inflight.get(key);
    if (flying) return flying as Promise<T>;
  }
  const p = fetcher()
    .then((data) => {
      results.set(key, { at: Date.now(), data });
      if (results.size > MAX_ENTRIES) results.delete(results.keys().next().value as string);
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export function peekCached<T>(key: string, now = Date.now()): T | undefined {
  const hit = results.get(key);
  return hit && now - hit.at < ttlFor(key) ? (hit.data as T) : undefined;
}

export function clearRequestCache() {
  inflight.clear();
  results.clear();
}
