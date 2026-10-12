import * as Sentry from "@sentry/react-native";
import { router } from "expo-router";
import { Alert } from "react-native";
import { createMutation } from "react-query-kit";
import { getClerk, getClerkErrorMessage } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

// Password reset moves to Clerk in its own change; until then it fails with
// this message instead of calling Supabase Auth.
const notAvailableYet = (): Promise<void> =>
  Promise.reject(
    new Error("This isn't available yet. Please try again later.")
  );

export const useLogoutMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    await getClerk().signOut();
    if (!IS_E2E) {
      segmentClient.track("User Logged Out");
      segmentClient.reset();
    }
  },
});

export interface ForgotPasswordData {
  email: string;
}

export const useForgotPasswordMutation = createMutation<
  void,
  ForgotPasswordData
>({
  mutationFn: (_data: ForgotPasswordData): Promise<void> => notAvailableYet(),
});

export interface ResetPasswordData {
  password: string;
}

export const useResetPasswordMutation = createMutation<void, ResetPasswordData>(
  {
    mutationFn: (_data: ResetPasswordData): Promise<void> => notAvailableYet(),
  }
);

// Deletes the User in Clerk (the instance must allow Users to delete their
// accounts), signs out and shows the login screen. Their rows are removed
// afterwards by the clerk-webhook edge function when Clerk delivers
// user.deleted.
export const useDeleteUserMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const clerk = getClerk();
    if (!clerk.user) {
      throw new Error("Not authenticated");
    }
    await clerk.user.delete();
    // The deletion already ended the session; a failed sign-out must not
    // report the deleted account as still there
    await clerk.signOut().catch(Sentry.captureException);
    if (!IS_E2E) {
      segmentClient.track("User Deleted Account");
      segmentClient.reset();
    }
  },
  onError: (error) => {
    Alert.alert("Couldn't delete your account", getClerkErrorMessage(error));
  },
  onSuccess: () => {
    router.replace("/auth/login");
  },
});
