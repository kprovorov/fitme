import { execFileSync } from "node:child_process";
import { SeedPg } from "@snaplet/seed/adapter-pg";
import { defineConfig } from "@snaplet/seed/config";
import { Client } from "pg";

const DB_URL_LINE = /^DB_URL='(.+)'$/m;

// Each worktree and branch runs its own local stack on CLI-assigned ports, so
// ask the CLI for the running stack's database URL.
const localDatabaseUrl = (): string => {
  const env = execFileSync(
    "supabase",
    ["status", "--env", "--output-format", "text"],
    { encoding: "utf8" }
  );
  const url = env.match(DB_URL_LINE)?.[1];
  if (!url) {
    throw new Error("No local Supabase stack is running; run `pnpm db start`.");
  }
  return url;
};

export default defineConfig({
  adapter: async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL ?? localDatabaseUrl(),
    });
    await client.connect();
    return new SeedPg(client);
  },
});
