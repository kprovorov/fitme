import { withSupabase } from "npm:@supabase/server";

// Supabase Auth user ids are UUIDs; any other User id (a Clerk id) has no
// Supabase Auth user to delete here.
const SUPABASE_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// delete_user_data refuses an id that rekey_user moved to a new User id
const ACCOUNT_MIGRATED = "55000";

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check before touching any data: deleting the rows and then failing to
    // delete the account would leave a live account with a retired id.
    if (!SUPABASE_USER_ID.test(userId)) {
      return Response.json(
        { error: "Only Supabase Auth accounts can be deleted here" },
        { status: 400 }
      );
    }

    // User-owned rows are no longer tied to auth.users, so deleting the auth
    // user doesn't cascade to them; remove them first. delete_user_data is
    // idempotent, so a retry after a failed deleteUser below is safe.
    const { error: dataError } = await ctx.supabaseAdmin.rpc(
      "delete_user_data",
      { user_id: userId }
    );

    // The account was migrated: its data and its live account are under the
    // new User id, so it has to be deleted from there
    if (dataError?.code === ACCOUNT_MIGRATED) {
      return Response.json(
        { error: "This account was migrated; delete it from the updated app" },
        { status: 409 }
      );
    }

    if (dataError) {
      return Response.json({ error: dataError.message }, { status: 500 });
    }

    const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  }),
};
