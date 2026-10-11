import { withSupabase } from "npm:@supabase/server";

// Supabase Auth user ids are UUIDs; any other User id (a Clerk id) has no
// Supabase Auth user to delete here.
const SUPABASE_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
