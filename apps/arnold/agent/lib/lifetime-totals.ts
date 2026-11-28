import { asUser } from "@fitme/db";
import { getLifetimeTotals } from "@fitme/services/lifetime-totals";

/**
 * The User's Lifetime totals as `get_lifetime_totals` and
 * `show_lifetime_totals` both answer them, with the weight unit the volume
 * is in: zeros for a User who hasn't trained.
 */
export const readLifetimeTotals = async (userId: string) =>
  await asUser(userId, async (tx) => await getLifetimeTotals(tx, userId));
