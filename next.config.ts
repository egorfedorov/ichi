import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg and pg-boss are node-only; keep them out of the bundler.
  serverExternalPackages: ["pg", "pg-boss"],
};

export default nextConfig;
