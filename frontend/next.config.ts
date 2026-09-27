import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // docker/frontend.Dockerfile
  reactStrictMode: true,
};

export default nextConfig;
