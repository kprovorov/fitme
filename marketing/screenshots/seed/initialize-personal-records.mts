/** Local screenshot fixture only. Run AFTER seed.sql; see ../README.md. */

import { localDatabaseUrl } from "../../../packages/db/integration/local-database-url";
import { asUser } from "../../../packages/db/src/index";
import { initializePersonalRecords } from "../../../packages/services/src/personal-records";

const [, , userId] = process.argv;
if (!(userId && /^user_[A-Za-z0-9]+$/.test(userId))) {
  throw new Error("Pass the fictional Clerk development User id (user_...)");
}

// Deliberately ignore any inherited deployment URL: this command discovers
// THIS worktree's local Supabase pooler, with the fixed local-only login.
process.env.FITME_DATABASE_URL = localDatabaseUrl(
  "screenshot-personal-records"
);

const result = await asUser(userId, (tx) =>
  initializePersonalRecords(tx, userId)
);
console.log(JSON.stringify(result));
