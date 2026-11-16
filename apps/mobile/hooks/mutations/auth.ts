import * as Sentry from "@sentry/react-native";
import { router } from "expo-router";
import { Alert } from "react-native";
import { createMutation } from "react-query-kit";

import type { ReverifiedResult } from "~/hooks/reverification";
import { clearSavedArnoldConversation } from "~/lib/arnold-chat";
import { getClerk, getClerkErrorMessage } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { i18n } from "~/lib/i18n";
import { segmentClient } from "~/lib/segment";

export const useLogoutMutation = createMutation({
  mutationFn: async (): Promise<void> => {
    await getClerk().signOut();

    if (!IS_E2E) {
      void segmentClient.track("User Logged Out");
      void segmentClient.reset();
    }
  },
});

/**
 * How a deletion went: `deleted`, or `cancelled` when the User backed out of
 * "Confirm it's you" (nothing was deleted).
 */
export type DeleteAccountOutcome = "cancelled" | "deleted";

/**
 * Deletes the User in Clerk: `user.delete()` as given (reverified, from the
 * Delete sheet), or called straight away (Settings and Legal).
 */
export interface DeleteAccountVariables {
  readonly remove?: () => Promise<ReverifiedResult<unknown>>;
}

/** Deletes the User in Clerk with no "Confirm it's you" in front of it. */
const deleteNow = async (user: {
  readonly delete: () => Promise<void>;
}): Promise<ReverifiedResult<undefined>> => {
  await user.delete();

  return { status: "done", value: undefined };
};

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

    const result = await (remove ?? (() => deleteNow(user)))();

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

    if (!IS_E2E) {
      void segmentClient.track("User Deleted Account");
      void segmentClient.reset();
    }

    return "deleted";
  },
  onError: (error, variables) => {
    // The Delete sheet says so itself.
    if (variables.remove) {
      return;
    }

    Alert.alert(i18n.t("settings.deleteFailed"), getClerkErrorMessage(error));
  },
  onSuccess: (outcome) => {
    if (outcome === "deleted") {
      router.replace("/auth");
    }
  },
});
