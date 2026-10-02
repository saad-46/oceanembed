/**
 * The one source of truth for "is there an OceanSight API this browser can use right now?".
 *
 * Two ways to have an API:
 *  - an explicit one (`NEXT_PUBLIC_API_URL`, inlined at build time), or
 *  - discovery: with no explicit URL the browser looks for the API on the visitor's own computer
 *    (`http://localhost:8100`). "localhost" is the computer of whoever is viewing the page, so this
 *    gives the full application to the machine that runs the OceanSight backend and saved data to
 *    everyone else.
 *
 * A public page may only reach localhost with the browser's Local Network Access permission.
 * Discovery is therefore permission-aware and never causes a browser prompt on its own:
 *   granted -> probe automatically, keep polling, reconnect automatically
 *   prompt  -> do not probe; `connect()` (an explicit user action) is the only thing that may prompt
 *   denied  -> stay offline, do not probe
 *   permission not exposed by the browser -> probe only after the visitor connected explicitly once
 * A page that is itself served from this computer (localhost) needs no permission.
 *
 * No React here; `lib/backendStatus.ts` binds this store to components.
 */
export const CONFIGURED_API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
export const LOCAL_API_URL = "http://localhost:8100";
/** No explicit API: discover one on the visitor's computer. */
export const DISCOVERY = CONFIGURED_API_URL === "";
export const API_BASE = CONFIGURED_API_URL || LOCAL_API_URL;

export interface Health {
  status: string;
  model_version: string | null;
  database: string;
  reconstruction_store: string;
}
export type BackendMode = "connecting" | "live" | "degraded" | "offline";
/** open = no browser permission involved; the rest mirror the Local Network Access permission. */
export type LocalAccess = "open" | "granted" | "prompt" | "denied" | "unknown";
export interface ConnectionState {
  mode: BackendMode;
  health: Health | null;
  access: LocalAccess;
  /** An explicit "Connect to Local API" action is available (and is the only thing that may prompt). */
  canConnect: boolean;
  /** `connect()` is in flight. */
  connectBusy: boolean;
  /** Short explanation of the last failed `connect()`. */
  connectError: string | null;
  /** Incremented every time the API comes back after being offline; data hooks refetch on it. */
  epoch: number;
}

export const POLL_MS = 20_000;
export const PROBE_TIMEOUT_MS = 2_500;
const FAILURES_BEFORE_OFFLINE = 2;
const OPT_IN_KEY = "oceansight.localApi";
const PERMISSION_NAMES = ["loopback-network", "local-network-access", "local-network"];
export const ACCESS_DENIED_MESSAGE = "Local API access is blocked for this site in the browser. Allow it in the site settings, then connect again.";
export const NOT_RUNNING_MESSAGE = "No local API answered at http://localhost:8100. Start the OceanSight backend on this computer, then connect again.";

const hasWindow = () => typeof window !== "undefined";

function pageIsLocal(): boolean {
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
}

function optedIn(): boolean {
  try {
    return window.localStorage.getItem(OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

let state: ConnectionState = {
  // Without a browser (build, tests on the server side) nothing is probed: an explicit API is assumed
  // reachable, discovery is offline.
  mode: hasWindow() ? "connecting" : DISCOVERY ? "offline" : "live",
  health: null,
  access: DISCOVERY ? "unknown" : "open",
  canConnect: false,
  connectBusy: false,
  connectError: null,
  epoch: 0,
};
const listeners = new Set<() => void>();
let started = false;
let probing = !hasWindow() && !DISCOVERY; // may `check()` talk to the API without a user action?
let failures = 0;
let inflight: Promise<ConnectionState> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let resolveFirst: () => void = () => {};
const first = new Promise<void>((r) => {
  resolveFirst = r;
});
if (!hasWindow()) resolveFirst();

function set(patch: Partial<ConnectionState>) {
  const next = { ...state, ...patch };
  next.canConnect = DISCOVERY && !probing && (next.access === "prompt" || next.access === "unknown");
  const same = (Object.keys(next) as (keyof ConnectionState)[]).every((k) => next[k] === state[k]);
  if (same) return;
  state = next;
  listeners.forEach((l) => l());
}

export const getConnection = () => state;
export const isUsable = () => state.mode === "live" || state.mode === "degraded";
/** Resolves once the first decision (online or offline) has been made. Never rejects. */
export const whenResolved = () => first;

async function probe(): Promise<Health | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}/ready`, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) return null; // 503 = the data is not there: offline, not an application error
    return (await r.json()) as Health;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function settle(h: Health | null) {
  if (h) {
    failures = 0;
    const wasOffline = state.mode === "offline";
    set({ mode: h.status === "ok" ? "live" : "degraded", health: h, connectError: null, epoch: state.epoch + (wasOffline ? 1 : 0) });
  } else {
    failures += 1;
    if (!isUsable() || failures >= FAILURES_BEFORE_OFFLINE) set({ mode: "offline", health: null });
  }
  resolveFirst();
}

/** One readiness check. Never runs two at once, and never talks to localhost without permission. */
export function check(): Promise<ConnectionState> {
  if (!probing) return Promise.resolve(state);
  inflight ??= probe()
    .then((h) => {
      settle(h);
      return state;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function tick() {
  if (typeof document !== "undefined" && document.hidden) return;
  void check();
}

function startTimer() {
  if (timer !== null || !hasWindow() || !probing || listeners.size === 0) return;
  timer = setInterval(tick, POLL_MS);
  window.addEventListener("online", tick);
  window.addEventListener("focus", tick);
}

function stopTimer() {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
  window.removeEventListener("online", tick);
  window.removeEventListener("focus", tick);
}

function beginProbing() {
  probing = true;
  set({});
  startTimer();
  return check();
}

function stopProbing() {
  probing = false;
  stopTimer();
  set({ mode: "offline", health: null });
  resolveFirst();
}

type PermissionLike = { state: string; onchange: (() => void) | null };
async function queryPermission(): Promise<PermissionLike | null> {
  const perms = typeof navigator !== "undefined" ? navigator.permissions : undefined;
  if (!perms?.query) return null;
  for (const name of PERMISSION_NAMES) {
    try {
      return (await perms.query({ name } as unknown as PermissionDescriptor)) as unknown as PermissionLike;
    } catch {
      // this browser does not know that permission name; try the next one
    }
  }
  return null;
}

const toAccess = (s: string | undefined): LocalAccess => (s === "granted" || s === "prompt" || s === "denied" ? s : "unknown");

function applyAccess(access: LocalAccess) {
  set({ access });
  if (access === "open" || access === "granted" || (access === "unknown" && optedIn())) {
    if (!probing) void beginProbing();
  } else if (probing || state.mode === "connecting") {
    stopProbing();
  }
}

/** Start watching the connection (idempotent; called when the first component subscribes). */
export function startConnection(): void {
  if (started || !hasWindow()) return;
  started = true;
  if (!DISCOVERY || process.env.NODE_ENV !== "production" || pageIsLocal()) {
    applyAccess("open");
    return;
  }
  void queryPermission().then((p) => {
    applyAccess(toAccess(p?.state));
    if (p) p.onchange = () => applyAccess(toAccess(p.state));
  });
}

/**
 * Explicit "Connect to Local API". The only code path that may make the browser ask the visitor for
 * Local Network Access. Resolves with the new state; a refusal or a stopped API leaves a short
 * `connectError` and the app offline.
 */
export async function connect(): Promise<ConnectionState> {
  if (state.connectBusy) return state;
  set({ connectBusy: true, connectError: null });
  const h = await probe();
  const p = await queryPermission();
  const access = p ? toAccess(p.state) : state.access;
  if (h) {
    try {
      window.localStorage.setItem(OPT_IN_KEY, "1");
    } catch {}
    probing = true;
    set({ access, connectBusy: false });
    settle(h);
    void beginProbing();
  } else if (access === "denied") {
    set({ access, connectBusy: false, connectError: ACCESS_DENIED_MESSAGE, mode: "offline" });
  } else {
    set({ access, connectBusy: false, connectError: NOT_RUNNING_MESSAGE, mode: "offline" });
    if (access === "granted") void beginProbing(); // allowed but not running: keep watching for it
  }
  return state;
}

/** A data request could not reach the API: verify with a readiness check before going offline. */
export function reportRequestFailure(): void {
  if (!isUsable()) return;
  failures = Math.max(failures, 1);
  void check();
}

export function reportRequestSuccess(): void {
  failures = 0;
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  startConnection();
  startTimer();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopTimer(); // no polling while nothing is watching
  };
}
