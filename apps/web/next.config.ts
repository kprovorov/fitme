import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next compiles them in place.
  transpilePackages: ["@fitme/core", "@fitme/supabase"],
};

export default nextConfig;
