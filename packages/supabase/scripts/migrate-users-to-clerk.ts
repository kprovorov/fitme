// Copies every Supabase Auth user into Clerk and rekeys their rows to the
// Clerk id (see clerk-migration.ts). Safe to rerun after a failure.
//
//   pnpm db users:migrate --dry-run   # no writes, prints the planned actions
//   pnpm db users:migrate
//
// Env: CLERK_SECRET_KEY (sk_test_… for development, sk_live_… for
// production), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
// (direct Postgres connection; reads the password digests in auth.users).
// Exits non-zero when rows still carry a legacy UUID after a real run.

import {
  type MigrationReport,
  migrateUsers,
  type UserResult,
  type UserStatus,
} from "./clerk-migration";

const SECTIONS: { status: UserStatus; title: string }[] = [
  { status: "created", title: "Created" },
  { status: "resumed", title: "Resumed (Clerk User already existed)" },
  { status: "already-migrated", title: "Already migrated" },
  { status: "skipped", title: "Skipped" },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

function describe(user: UserResult): string {
  const parts = [
    `${user.email ?? "(no email)"} ${user.legacyId}`,
    user.clerkId && `-> ${user.clerkId}`,
    `${user.rowCount} rows`,
  ];
  const notes = [
    user.reason,
    user.passwordNotImported &&
      `password not imported: ${user.passwordNotImported}`,
  ].filter(Boolean);
  return `  ${parts.filter(Boolean).join(" ")}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`;
}

function printReport(report: MigrationReport): void {
  console.log(`\n${report.dryRun ? "Dry run, nothing written" : "Summary"}`);
  for (const { status, title } of SECTIONS) {
    const users = report.users.filter((user) => user.status === status);
    console.log(`\n${title}: ${users.length}`);
    for (const user of users) {
      console.log(describe(user));
    }
  }

  const withoutPassword = report.users.filter(
    (user) => user.passwordNotImported && user.status !== "skipped"
  );
  console.log(
    `\nWithout an imported password (forgot-password flow): ${withoutPassword.length}`
  );
  for (const user of withoutPassword) {
    console.log(
      `  ${user.email} ${user.legacyId}: ${user.passwordNotImported}`
    );
  }

  console.log("\nRows still under a legacy UUID:");
  for (const [table, count] of Object.entries(report.legacyRows)) {
    console.log(`  ${table}: ${count}`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const unknown = args.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(" ")}`);
  }
  const dryRun = args.includes("--dry-run");

  const clerkSecretKey = requireEnv("CLERK_SECRET_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const instance = clerkSecretKey.startsWith("sk_live_")
    ? "production"
    : "development";
  console.log(
    `${dryRun ? "Dry run: " : ""}migrating Supabase Auth users at ${supabaseUrl} into the Clerk ${instance} instance`
  );

  const report = await migrateUsers({
    clerkSecretKey,
    databaseUrl: requireEnv("SUPABASE_DB_URL"),
    dryRun,
    onProgress: (user) => console.log(`[${user.status}]${describe(user)}`),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl,
  });
  printReport(report);

  const legacyRows = Object.values(report.legacyRows).reduce(
    (sum, count) => sum + count,
    0
  );
  if (!dryRun && legacyRows > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
