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
    expect(api.friendlyError(err)).toMatch(/NEXT_PUBLIC_API_URL is not set/);
    expect(fetch.mock.calls.map(([u]) => u)).toEqual(["/fallback/v1_meta.json", "/fallback/health.json"]);
  });
});
