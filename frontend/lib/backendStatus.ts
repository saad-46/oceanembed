"use client";
import { useSyncExternalStore } from "react";
import { check, connect, getConnection, subscribeConnection, type BackendMode, type ConnectionState, type Health } from "./connection";

/**
 * React binding for the shared connection state (lib/connection.ts): Online / Offline for the status
 * bar, the sidebar, the Offline notice and the data hooks. One store, one poller, no per-page checks.
 */
export type { BackendMode, Health };
export type BackendStatus = ConnectionState;

const SERVER: ConnectionState = { mode: "connecting", health: null, access: "unknown", canConnect: false, connectBusy: false, connectError: null, epoch: 0 };

export function useBackendStatus(): BackendStatus {
  return useSyncExternalStore(subscribeConnection, getConnection, () => SERVER);
}

export const checkBackend = check;
export const connectLocalApi = connect;

/** The status indicator dispatches this to reopen the Offline notice after it was dismissed. */
export const OFFLINE_NOTICE_EVENT = "oceansight:offline-notice";
/** Dispatched when the notice is closed, so other first-visit prompts can take their turn. */
export const OFFLINE_NOTICE_CLOSED_EVENT = "oceansight:offline-notice-closed";
const SEEN_KEY = "oceansight.offlineNotice";

export function offlineNoticeSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true; // storage blocked: never hold other prompts back
  }
}
export function markOfflineNoticeSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {}
  window.dispatchEvent(new Event(OFFLINE_NOTICE_CLOSED_EVENT));
}
