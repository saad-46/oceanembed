import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // docker/frontend.Dockerfile
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
