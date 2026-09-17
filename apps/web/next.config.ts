import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not regenerate AGENTS.md/CLAUDE.md on every dev run; the repo root owns those.
  agentRules: false,
  // Workspace packages ship TypeScript source, so Next compiles them in place.
  transpilePackages: ["@fitme/core", "@fitme/supabase"],
};

export default nextConfig;
