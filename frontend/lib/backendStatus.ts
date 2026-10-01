"use client";
import { useSyncExternalStore } from "react";
import { API_CONFIGURED, get } from "./api";

/**
 * One shared view of the live backend for the whole app (status bar, sidebar, Offline Demo notice).
 *
 * - A build without NEXT_PUBLIC_API_URL has no backend by design: it is in Offline Demo Mode from the
 *   first render and never makes a health request.
 * - Otherwise `/health` is polled while anything is subscribed, so the app moves between Live and
 *   Offline Demo on its own when the backend comes up or goes down.
 */
export interface Health {
  status: string;
  model_version: string | null;
  database: string;
  reconstruction_store: string;
}
export type BackendMode = "connecting" | "live" | "degraded" | "offline";
export interface BackendStatus {
  mode: BackendMode;
  health: Health | null;
}

const POLL_MS = 20_000;
const CONNECTING: BackendStatus = { mode: "connecting", health: null };
const OFFLINE: BackendStatus = { mode: "offline", health: null };

let state: BackendStatus = API_CONFIGURED ? CONNECTING : OFFLINE;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function set(next: BackendStatus) {
  if (next.mode === state.mode && next.health?.model_version === state.health?.model_version && next.health?.database === state.health?.database) return;
  state = next;
  listeners.forEach((l) => l());
}

export async function checkBackend(): Promise<BackendStatus> {
  if (!API_CONFIGURED) return state;
  try {
    const h = await get<Health>("/health");
    set({ mode: h.status === "ok" ? "live" : "degraded", health: h });
  } catch {
    set(OFFLINE);
  }
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (API_CONFIGURED && timer === null && typeof window !== "undefined") {
    void checkBackend();
    timer = setInterval(checkBackend, POLL_MS);
    window.addEventListener("online", checkBackend);
    window.addEventListener("focus", checkBackend);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      window.removeEventListener("online", checkBackend);
      window.removeEventListener("focus", checkBackend);
    }
  };
}

export function useBackendStatus(): BackendStatus {
  return useSyncExternalStore(subscribe, () => state, () => CONNECTING);
}

/** The status indicator dispatches this to reopen the Offline Demo notice after it was dismissed. */
export const OFFLINE_NOTICE_EVENT = "oceansight:offline-notice";
