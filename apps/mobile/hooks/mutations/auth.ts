import * as Sentry from "@sentry/react-native";
import { router } from "expo-router";
import { createMutation } from "react-query-kit";

import type { ReverifiedResult } from "~/hooks/reverification";
import { analytics } from "~/lib/analytics";
import { clearSavedArnoldConversation } from "~/lib/arnold-chat";
import { getClerk } from "~/lib/clerk";

export const useLogoutMutation = createMutation({
  mutationFn: async (): Promise<void> => {
    // Sent first, under the User's id: once Clerk has signed them out,
    // AuthSync resets the identity (it resets on every sign-out, this one
    // included), and the event would go out anonymous. A sign-out that then
    // fails still counts as a log-out: rare, and the SDK takes no distinct id
    // per event, so this is the one order that keeps it on the User.
    void analytics.send("User Logged Out");

    await getClerk().signOut();
  },
});

/**
 * How a deletion went: `deleted`, or `cancelled` when the User backed out of
 * "Confirm it's you" (nothing was deleted).
 */
export type DeleteAccountOutcome = "cancelled" | "deleted";

/**
 * Deletes the User in Clerk: `user.delete()` as the Delete sheet hands it,
 * behind "Confirm it's you" (`useReverifiedCall`).
 */
export interface DeleteAccountVariables {
  readonly remove: () => Promise<ReverifiedResult<unknown>>;
}

// Deletes the User in Clerk (the instance must allow Users to delete their
// accounts), signs out and shows the login screen. Their rows are removed
// afterwards by apps/webhooks when Clerk delivers user.deleted.
export const useDeleteUserMutation = createMutation<
  DeleteAccountOutcome,
  DeleteAccountVariables
>({
  mutationFn: async ({ remove }): Promise<DeleteAccountOutcome> => {
    const clerk = getClerk();
    const { user } = clerk;

    if (!user) {
      throw new Error("Not authenticated");
    }

    const userId = user.id;

    const result = await remove();

    // Cancelled at "Confirm it's you": nothing was deleted, so nothing is
    // cleaned up.
    if (result.status === "cancelled") {
      return "cancelled";
    }

    // The server wipes Arnold Conversations; drop this device's copy too,
    // with every device copy of the Attachments they sent (ADR 0018), before
    // the sign-out below. The account is gone by now, so nothing is removed
    // for a deletion that failed.
    clearSavedArnoldConversation(userId);
    // The deletion already ended the session; a failed sign-out must not
    // report the deleted account as still there
    await clerk.signOut().catch(Sentry.captureException);

    // Anonymous, once AuthSync has reset the identity for this sign-out:
    // sent under the deleted User's id, it could reach PostHog after the
    // webhook has deleted their person, and bring it back.
    void analytics.sendAfterReset("User Deleted Account");

    return "deleted";
  },
  onSuccess: (outcome) => {
    if (outcome === "deleted") {
      router.replace("/auth");
    }
  },
});
