import { eveChannel } from "eve/channels/eve";
import { clerkSession } from "../lib/clerk-auth";

// Clerk session tokens only: no localDev() or vercelOidc() fallback, so a
// request without a valid token gets a 401 everywhere, including locally.
export default eveChannel({
  auth: clerkSession(),
});
