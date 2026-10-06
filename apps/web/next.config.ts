import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not regenerate AGENTS.md/CLAUDE.md on every dev run; the repo root owns those.
  agentRules: false,
  // The OAuth consent page must not be framed (clickjacking, RFC 6819).
  headers: async () => [
    {
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ],
      source: "/oauth/:path*",
    },
  ],
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next compiles them in place.
  transpilePackages: ["@fitme/core", "@fitme/supabase"],
};

export default nextConfig;
