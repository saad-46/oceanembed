import { afterEach, describe, expect, it, vi } from "vitest";

/** lib/api reads NEXT_PUBLIC_API_URL / NODE_ENV at import time (Next inlines them at build time). */
async function load(env: { NODE_ENV: string; NEXT_PUBLIC_API_URL?: string }) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env.NODE_ENV);
  vi.stubEnv("NEXT_PUBLIC_API_URL", env.NEXT_PUBLIC_API_URL ?? "");
  return import("@/lib/api");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API base URL", () => {
  it("defaults to the local backend outside production builds", async () => {
    const api = await load({ NODE_ENV: "development" });
    expect(api.API_URL).toBe("http://localhost:8100");
    expect(api.apiUrl("/docs")).toBe("http://localhost:8100/docs");
  });

  it("uses NEXT_PUBLIC_API_URL in production, without a trailing slash", async () => {
    const api = await load({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: " https://api.example.org/ " });
    expect(api.API_CONFIGURED).toBe(true);
    expect(api.apiUrl("/v1/meta")).toBe("https://api.example.org/v1/meta");
  });

  it("never falls back to localhost in a production build", async () => {
    const api = await load({ NODE_ENV: "production" });
    expect(api.API_CONFIGURED).toBe(false);
    expect(api.API_URL).toBe("");
    expect(api.apiUrl("/docs")).toBeNull();
  });

  it("serves bundled snapshots when unconfigured, without calling any backend", async () => {
    const api = await load({ NODE_ENV: "production" });
    const fetch = vi.fn(async (url: string) => (url === "/fallback/v1_meta.json" ? new Response(JSON.stringify({ product: "OceanSight" })) : new Response("", { status: 404 })));
    vi.stubGlobal("fetch", fetch);
    await expect(api.get<{ product: string }>("/v1/meta")).resolves.toMatchObject({ product: "OceanSight", __fallback: true });
    const err = await api.get("/health").catch((e) => e);
    expect(err).toBeInstanceOf(api.ApiError);
    expect(err.code).toBe("api_not_configured");
    expect(api.friendlyError(err)).toMatch(/Offline Demo Mode because deploying the complete backend requires paid cloud infrastructure and an active cloud billing setup/);
    expect(fetch.mock.calls.map(([u]) => u)).toEqual(["/fallback/v1_meta.json", "/fallback/health.json"]);
  });
});

describe("live backend contract", () => {
  const live = { NODE_ENV: "production", NEXT_PUBLIC_API_URL: "https://api.example.org" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("calls the configured backend for GET and POST and returns live (non-fallback) data", async () => {
    const api = await load(live);
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const g = await api.get<{ ok: boolean }>("/v1/meta");
    expect(g.__fallback).toBeUndefined();
    await api.post("/v1/region/stats", { date: "2023-05-11" });
    expect(fetch.mock.calls[0][0]).toBe("https://api.example.org/v1/meta");
    expect(fetch.mock.calls[1][0]).toBe("https://api.example.org/v1/region/stats");
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ date: "2023-05-11" }) });
  });

  it("keeps typed API errors distinct: invalid input and no data are not 'API unavailable'", async () => {
    const api = await load(live);
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "on_land", detail: "x" }, 422)));
    const land = await api.get("/v1/profile/2023-05-11?lat=20&lon=78").catch((e) => e);
    expect(land.code).toBe("on_land");
    expect(api.friendlyError(land)).toMatch(/on land or outside the study domain/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "date_out_of_range", detail: "2030-01-01 is outside the reconstructed period." }, 404)));
    const date = await api.get("/v1/grid/2030-01-01?depth=100").catch((e) => e);
    expect(api.friendlyError(date)).toMatch(/^No reconstruction for that date/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "data_unavailable", detail: "x" }, 503)));
    const typed503 = await api.get("/v1/grid/2023-05-11/product?product=tchp").catch((e) => e);
    expect(typed503.code).toBe("data_unavailable"); // the API's own 503 is never mistaken for a gateway error
  });

  it("uses a saved copy when the backend is unreachable, and says so clearly when there is none", async () => {
    const api = await load(live);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("https://api.example.org")) throw new TypeError("Failed to fetch");
      return url === "/fallback/v1_meta.json" ? json({ product: "OceanSight" }) : new Response("", { status: 404 });
    }));
    await expect(api.get("/v1/meta")).resolves.toMatchObject({ __fallback: true });
    const err = await api.get("/v1/profile/2022-01-01?lat=10&lon=60").catch((e) => e);
    expect(err.code).toBe("backend_unreachable");
    expect(api.friendlyError(err)).toMatch(/temporarily unavailable/);
    expect(api.friendlyError(err)).not.toMatch(/NEXT_PUBLIC_API_URL/);
  });

  it("treats an untyped gateway 502/503/504 as API unavailable, not a bare HTTP error", async () => {
    const api = await load(live);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("https://") ? new Response("<html>Bad Gateway</html>", { status: 502 }) : new Response("", { status: 404 }))));
    const err = await api.get("/health").catch((e) => e);
    expect(err.code).toBe("backend_unreachable");
    expect(api.friendlyError(err)).toMatch(/temporarily unavailable/);
  });
});

describe("backend status", () => {
  it("is Offline Demo from the start, with no health request, when the build has no backend", async () => {
    await load({ NODE_ENV: "production" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const status = await import("@/lib/backendStatus");
    expect((await status.checkBackend()).mode).toBe("offline");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports live when the configured backend answers, and offline when it stops answering", async () => {
    await load({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: "https://api.example.org" });
    const status = await import("@/lib/backendStatus");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", model_version: "cnn-unet-v1", database: "ok", reconstruction_store: "ok" }))));
    expect((await status.checkBackend()).mode).toBe("live");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("https://")) throw new TypeError("Failed to fetch");
      return new Response("", { status: 404 });
    }));
    expect((await status.checkBackend()).mode).toBe("offline");
  });
});
