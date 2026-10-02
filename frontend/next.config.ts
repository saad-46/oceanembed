import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  output: "standalone", // docker/frontend.Dockerfile
  reactStrictMode: true,
  devIndicators: false,
};

/** NEXT_PUBLIC_API_URL is inlined at build time, so a misconfigured deploy is visible in the build log. */
function checkApiUrl() {
  if (process.env.OCEANSIGHT_API_URL_CHECKED) return; // config is loaded again by build workers
  process.env.OCEANSIGHT_API_URL_CHECKED = "1";
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!url) {
    console.warn(
      "\nNEXT_PUBLIC_API_URL is not set: the browser will look for the OceanSight API on the visitor's own computer " +
        "(http://localhost:8100, permission-aware) and otherwise serve the bundled saved data (public/fallback/).\n",
    );
  } else if (process.env.VERCEL && /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]?/.test(url)) {
    console.warn(`\n⚠ NEXT_PUBLIC_API_URL=${url} points at a local machine; visitors' browsers cannot reach it. Use the deployed FastAPI URL.\n`);
  }
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) checkApiUrl();
  return nextConfig;
}
