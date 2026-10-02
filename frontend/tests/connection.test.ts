import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/connection decides Online / Offline in the browser. These tests give it a minimal browser
 * (window, navigator.permissions, document, fetch) and check the permission-aware discovery rules.
 */
type Perm = "granted" | "prompt" | "denied" | "unsupported";
const READY = { status: "ok", model_version: "cnn-unet-v1", database: "ok", reconstruction_store: "ok" };
const ok = () => new Response(JSON.stringify(READY), { status: 200 });

function browser(opts: { permission?: Perm; hostname?: string; optIn?: boolean } = {}) {
  const store = new Map<string, string>(opts.optIn ? [["oceansight.localApi", "1"]] : []);
  const perm = { state: opts.permission ?? "prompt", onchange: null as (() => void) | null };
  const query = vi.fn(async () => {
    if (perm.state === "unsupported") throw new TypeError("unknown permission");
    return perm;
  });
  vi.stubGlobal("window", {
    location: { hostname: opts.hostname ?? "ocean-sight.vercel.app" },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { permissions: { query } });
  vi.stubGlobal("document", { hidden: false });
  return { perm, query, store };
}

async function load(env: { NEXT_PUBLIC_API_URL?: string; NODE_ENV?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env.NODE_ENV ?? "production");
  vi.stubEnv("NEXT_PUBLIC_API_URL", env.NEXT_PUBLIC_API_URL ?? "");
  return import("@/lib/connection");
}
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("permission-aware discovery of the local API", () => {
  it("starts in a checking state in the browser", async () => {
    browser({ permission: "granted" });
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const c = await load();
    expect(c.getConnection().mode).toBe("connecting");
  });

  it("permission 'prompt': never contacts localhost on its own, stays offline, offers Connect", async () => {
    browser({ permission: "prompt" });
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    await vi.advanceTimersByTimeAsync(3 * c.POLL_MS);
    expect(fetch).not.toHaveBeenCalled();
    expect(c.getConnection()).toMatchObject({ mode: "offline", access: "prompt", canConnect: true });
    await expect(c.whenResolved()).resolves.toBeUndefined();
  });

  it("permission 'granted' + /ready 200: online automatically, no Connect action", async () => {
    browser({ permission: "granted" });
    const fetch = vi.fn<(u: string) => Promise<Response>>(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(fetch.mock.calls.map(([u]) => u)).toEqual(["http://localhost:8100/ready"]);
    expect(c.getConnection()).toMatchObject({ mode: "live", access: "granted", canConnect: false });
  });

  it("/ready 503 means offline, not an application error", async () => {
    browser({ permission: "granted" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ready: false }), { status: 503 })));
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(c.getConnection().mode).toBe("offline");
  });

  it("a network error means offline", async () => {
    browser({ permission: "granted" });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(c.getConnection().mode).toBe("offline");
  });

  it("a readiness check that hangs is aborted after the short timeout", async () => {
    browser({ permission: "granted" });
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))));
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(c.getConnection().mode).toBe("connecting");
    await vi.advanceTimersByTimeAsync(c.PROBE_TIMEOUT_MS + 10);
    expect(c.getConnection().mode).toBe("offline");
    expect(c.PROBE_TIMEOUT_MS).toBeLessThanOrEqual(3000);
  });

  it("permission 'denied': offline, no request, no polling, no Connect action", async () => {
    browser({ permission: "denied" });
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    await vi.advanceTimersByTimeAsync(3 * c.POLL_MS);
    expect(fetch).not.toHaveBeenCalled();
    expect(c.getConnection()).toMatchObject({ mode: "offline", access: "denied", canConnect: false });
  });

  it("browser without the permission API: no automatic probe until the visitor has connected once", async () => {
    browser({ permission: "unsupported" });
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    let c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(c.getConnection()).toMatchObject({ mode: "offline", access: "unknown", canConnect: true });

    browser({ permission: "unsupported", optIn: true }); // a later visit, after an explicit Connect
    c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(c.getConnection().mode).toBe("live");
  });

  it("a page served from this computer needs no permission", async () => {
    const { query } = browser({ permission: "prompt", hostname: "localhost" });
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(query).not.toHaveBeenCalled();
    expect(c.getConnection()).toMatchObject({ mode: "live", access: "open" });
  });

  it("an explicit NEXT_PUBLIC_API_URL is used as the API and involves no permission", async () => {
    const { query } = browser({ permission: "prompt" });
    const fetch = vi.fn<(u: string) => Promise<Response>>(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const c = await load({ NEXT_PUBLIC_API_URL: "https://api.example.org/" });
    c.subscribeConnection(() => {});
    await settle();
    expect(c.DISCOVERY).toBe(false);
    expect(fetch.mock.calls.map(([u]) => u)).toEqual(["https://api.example.org/ready"]);
    expect(query).not.toHaveBeenCalled();
    expect(c.getConnection().mode).toBe("live");
  });
});

describe("Connect to Local API (explicit user action)", () => {
  it("allowed and running: online, remembered, polling starts", async () => {
    const b = browser({ permission: "prompt" });
    const fetch = vi.fn(async () => {
      b.perm.state = "granted"; // the visitor clicked Allow on the browser prompt
      return ok();
    });
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    const s = await c.connect();
    expect(s).toMatchObject({ mode: "live", access: "granted", canConnect: false, connectError: null });
    expect(b.store.get("oceansight.localApi")).toBe("1");
    const before = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(c.POLL_MS + 10);
    expect(fetch.mock.calls.length).toBeGreaterThan(before);
  });

  it("denied by the visitor: stays offline with a short explanation and never probes again", async () => {
    const b = browser({ permission: "prompt" });
    const fetch = vi.fn(async () => {
      b.perm.state = "denied";
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    const s = await c.connect();
    expect(s).toMatchObject({ mode: "offline", access: "denied", canConnect: false, connectError: c.ACCESS_DENIED_MESSAGE });
    await vi.advanceTimersByTimeAsync(3 * c.POLL_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("allowed but the API is not running: offline with a hint, then reconnects by itself", async () => {
    const b = browser({ permission: "prompt" });
    let up = false;
    const fetch = vi.fn(async () => {
      b.perm.state = "granted";
      if (!up) throw new TypeError("Failed to fetch");
      return ok();
    });
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    const s = await c.connect();
    expect(s).toMatchObject({ mode: "offline", access: "granted", connectError: c.NOT_RUNNING_MESSAGE });
    up = true;
    await vi.advanceTimersByTimeAsync(c.POLL_MS + 10);
    expect(c.getConnection()).toMatchObject({ mode: "live", connectError: null });
  });
});

describe("transitions and polling", () => {
  it("online → offline needs two consecutive failures; offline → online needs one success", async () => {
    browser({ permission: "granted" });
    let up = true;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return ok();
    }));
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(c.getConnection()).toMatchObject({ mode: "live", epoch: 0 });
    up = false;
    await c.check();
    expect(c.getConnection().mode).toBe("live"); // one failure is not enough
    await c.check();
    expect(c.getConnection().mode).toBe("offline");
    up = true;
    await c.check();
    expect(c.getConnection()).toMatchObject({ mode: "live", epoch: 1 }); // epoch tells data hooks to refetch
  });

  it("polls every 20 s, and reconnects automatically when the API comes back", async () => {
    browser({ permission: "granted" });
    let up = false;
    const fetch = vi.fn(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return ok();
    });
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    expect(c.getConnection().mode).toBe("offline");
    expect(c.POLL_MS).toBe(20_000);
    await vi.advanceTimersByTimeAsync(c.POLL_MS - 100);
    expect(fetch).toHaveBeenCalledTimes(1); // nothing between polls
    up = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(c.getConnection().mode).toBe("live");
  });

  it("never runs two readiness checks at once", async () => {
    browser({ permission: "granted" });
    let release: (r: Response) => void = () => {};
    const fetch = vi.fn(() => new Promise<Response>((r) => (release = r)));
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    c.subscribeConnection(() => {}); // a second subscriber (e.g. React Strict Mode double mount)
    await settle();
    void c.check();
    void c.check();
    expect(fetch).toHaveBeenCalledTimes(1);
    release(ok());
    await settle();
    expect(c.getConnection().mode).toBe("live");
  });

  it("stops polling when nothing is subscribed any more", async () => {
    browser({ permission: "granted" });
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    const off = c.subscribeConnection(() => {});
    await settle();
    off();
    const n = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * c.POLL_MS);
    expect(fetch.mock.calls.length).toBe(n);
  });

  it("does not poll while the tab is hidden", async () => {
    browser({ permission: "granted" });
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const c = await load();
    c.subscribeConnection(() => {});
    await settle();
    vi.stubGlobal("document", { hidden: true });
    const n = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3 * c.POLL_MS);
    expect(fetch.mock.calls.length).toBe(n);
  });
});

describe("API client on top of the connection", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("offline: answers from saved copies and sends nothing to localhost", async () => {
    browser({ permission: "prompt" });
    const fetch = vi.fn(async (url: string) =>
      url === "/fallback/index.json" ? json(["v1_meta"]) : url === "/fallback/v1_meta.json" ? json({ product: "OceanSight" }) : new Response("", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetch);
    await load();
    const api = await import("@/lib/api");
    await expect(api.get("/v1/meta")).resolves.toMatchObject({ __fallback: true });
    const err = await api.get("/v1/profile/2021-08-15?lat=12.000&lon=65.000").catch((e) => e);
    expect(err.code).toBe("api_not_configured");
    expect(api.apiUrl("/docs")).toBeNull();
    expect(fetch.mock.calls.map(([u]) => u).filter((u) => u.includes("localhost"))).toEqual([]);
  });

  it("online: uses the local API; a typed 422 or a 500 is a real error and does not switch the app offline", async () => {
    browser({ permission: "granted" });
    let data: Response = json({ product: "OceanSight" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/ready") ? ok() : data)));
    const c = await load();
    const api = await import("@/lib/api");
    const meta = await api.get<{ product: string }>("/v1/meta");
    expect(meta.__fallback).toBeUndefined();
    expect(api.apiUrl("/docs")).toBe("http://localhost:8100/docs");
    data = json({ error: "on_land", detail: "x" }, 422);
    expect((await api.get("/v1/profile/2023-05-11?lat=20&lon=78").catch((e) => e)).code).toBe("on_land");
    data = json({ error: "internal_error", detail: "Unexpected server error." }, 500);
    expect((await api.get("/v1/meta").catch((e) => e)).code).toBe("internal_error");
    await settle();
    expect(c.getConnection().mode).toBe("live");
  });

  it("online, then the API dies mid-session: the request falls back and the app goes offline after a re-check", async () => {
    browser({ permission: "granted" });
    let up = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("http://localhost:8100")) {
        if (!up) throw new TypeError("Failed to fetch");
        return url.endsWith("/ready") ? ok() : json({ product: "OceanSight" });
      }
      return url === "/fallback/index.json" ? json(["v1_meta"]) : url === "/fallback/v1_meta.json" ? json({ product: "OceanSight" }) : new Response("", { status: 404 });
    }));
    const c = await load();
    const api = await import("@/lib/api");
    await api.get("/v1/meta");
    expect(c.getConnection().mode).toBe("live");
    up = false;
    await expect(api.get("/v1/meta")).resolves.toMatchObject({ __fallback: true }); // saved copy, no crash
    await settle();
    expect(c.getConnection().mode).toBe("offline");
  });
});
