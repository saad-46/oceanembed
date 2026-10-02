"use client";
import { useEffect, useRef, useState } from "react";
import { friendlyError, get, post, type Fetched } from "./api";
import { useBackendStatus } from "./backendStatus";
import { cachedRequest } from "./requestCache";

/**
 * Fetch hook keyed by request. `loading` is derived (current key not yet resolved) and the previous
 * data is kept while the next request is in flight, so panels never flash blank (docs/12).
 * Identical requests from different components share one network call (lib/requestCache).
 * Pass `null` as path to skip.
 */
export function useApi<T>(path: string | null, body?: unknown) {
  const key = path === null ? null : body === undefined ? path : `${path}#${JSON.stringify(body)}`;
  const [st, setSt] = useState<{ key: string | null; data: Fetched<T> | null; error: string | null }>({ key: null, data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const usedNonce = useRef(0);
  // When the API comes back after being offline, saved copies and "backend required" states are replaced
  // by live data: the reconnect epoch is part of the effect, and that refetch bypasses the shared cache.
  const { epoch } = useBackendStatus();
  const usedEpoch = useRef(epoch);
  useEffect(() => {
    if (key === null) return;
    const [p, b] = key.includes("#") ? [key.slice(0, key.indexOf("#")), JSON.parse(key.slice(key.indexOf("#") + 1))] : [key, undefined];
    let alive = true;
    const force = nonce !== usedNonce.current || epoch !== usedEpoch.current; // Retry or reconnect bypasses the shared cache
    usedNonce.current = nonce;
    usedEpoch.current = epoch;
    cachedRequest<Fetched<T>>(key, () => (b === undefined ? get<T>(p) : post<T>(p, b)), { force })
      .then((data) => alive && setSt({ key, data, error: null }))
      .catch((e) => alive && setSt((s) => ({ key, data: s.data, error: friendlyError(e) })));
    return () => {
      alive = false;
    };
  }, [key, nonce, epoch]);
  const settled = st.key === key;
  const retry = () => {
    setSt((s) => ({ ...s, key: null, error: null }));
    setNonce((n) => n + 1);
  };
  return { data: st.data, error: settled ? st.error : null, loading: key !== null && !settled, settled, retry };
}
