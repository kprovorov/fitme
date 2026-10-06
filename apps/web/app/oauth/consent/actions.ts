"use server";

import { redirect } from "next/navigation";
import { createClient } from "~/lib/supabase/server";
import { consentPath, isAuthorizationId } from "./authorization";

/**
 * Approves or denies an OAuth authorization request (e.g. an MCP client asking
 * for the user's Fitme data) and sends the browser back to the client.
 */
export async function decideAuthorization(formData: FormData) {
  const authorizationId = formData.get("authorization_id");
  const decision = formData.get("decision");
  if (!isAuthorizationId(authorizationId)) {
    throw new Error("Missing or malformed authorization request.");
  }

  const supabase = await createClient();
  const options = { skipBrowserRedirect: true };
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
      : await supabase.auth.oauth.denyAuthorization(authorizationId, options);

  if (error) {
    redirect(consentPath(authorizationId, "decision_failed"));
  }
  redirect(data.redirect_url);
}
