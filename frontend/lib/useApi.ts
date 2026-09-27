"use client";
import { useEffect, useState } from "react";
import { friendlyError, get, post, type Fetched } from "./api";

/**
 * Fetch hook keyed by request. `loading` is derived (current key not yet resolved) and the previous
 * data is kept while the next request is in flight, so panels never flash blank (docs/12).
 * Pass `null` as path to skip.
 */
export function useApi<T>(path: string | null, body?: unknown) {
  const key = path === null ? null : body === undefined ? path : `${path}#${JSON.stringify(body)}`;
  const [st, setSt] = useState<{ key: string | null; data: Fetched<T> | null; error: string | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    if (key === null) return;
    const [p, b] = key.includes("#") ? [key.slice(0, key.indexOf("#")), JSON.parse(key.slice(key.indexOf("#") + 1))] : [key, undefined];
    let alive = true;
    (b === undefined ? get<T>(p) : post<T>(p, b))
      .then((data) => alive && setSt({ key, data, error: null }))
      .catch((e) => alive && setSt((s) => ({ key, data: s.data, error: friendlyError(e) })));
    return () => {
      alive = false;
    };
  }, [key]);
  const settled = st.key === key;
  return { data: st.data, error: settled ? st.error : null, loading: key !== null && !settled, settled };
}
