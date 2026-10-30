import * as Sentry from "@sentry/react-native";
import { router } from "expo-router";
import { Alert } from "react-native";
import { createMutation } from "react-query-kit";
import { clearSavedArnoldConversation } from "~/lib/arnold-chat";
import { getClerk, getClerkErrorMessage } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { i18n } from "~/lib/i18n";
import { segmentClient } from "~/lib/segment";

export const useLogoutMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    await getClerk().signOut();
    if (!IS_E2E) {
      segmentClient.track("User Logged Out");
      segmentClient.reset();
    }
  },
});

// Deletes the User in Clerk (the instance must allow Users to delete their
// accounts), signs out and shows the login screen. Their rows are removed
// afterwards by apps/webhooks when Clerk delivers user.deleted.
export const useDeleteUserMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const clerk = getClerk();
    if (!clerk.user) {
      throw new Error("Not authenticated");
    }
    const userId = clerk.user.id;
    await clerk.user.delete();
    // The server wipes Arnold Conversations; drop this device's copy too.
    clearSavedArnoldConversation(userId);
    // The deletion already ended the session; a failed sign-out must not
    // report the deleted account as still there
    await clerk.signOut().catch(Sentry.captureException);
    if (!IS_E2E) {
      segmentClient.track("User Deleted Account");
      segmentClient.reset();
    }
  },
  onError: (error) => {
    Alert.alert(i18n.t("settings.deleteFailed"), getClerkErrorMessage(error));
  },
  onSuccess: () => {
    router.replace("/auth/login");
  },
});
