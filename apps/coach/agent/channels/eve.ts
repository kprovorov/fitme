import { eveChannel } from "eve/channels/eve";
import { claimSession } from "../lib/claim-session";
import { clerkSession } from "../lib/clerk-auth";
import { accountDeletionReset } from "../lib/reset-auth";

// Clerk session tokens, plus apps/webhooks' reset secret (reset routes only,
// for account deletion). No localDev() or vercelOidc() fallback, so a request
// without either gets a 401 everywhere, including locally.
export default eveChannel({
  auth: [accountDeletionReset(), clerkSession({ claimSession })],
});
