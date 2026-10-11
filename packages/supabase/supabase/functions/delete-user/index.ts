import { withSupabase } from "npm:@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // User-owned rows are no longer tied to auth.users, so deleting the auth
    // user doesn't cascade to them; remove them first.
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
