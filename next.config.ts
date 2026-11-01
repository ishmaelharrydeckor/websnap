import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server folder (.next/standalone) keeps the Docker image small.
  output: "standalone",
};

export default nextConfig;
