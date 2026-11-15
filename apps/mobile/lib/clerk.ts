import {
  getClerkInstance,
  isClerkAPIResponseError,
  isClerkRuntimeError,
} from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { z } from "zod";

import { i18n } from "~/lib/i18n";

export const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

export { tokenCache } from "@clerk/expo/token-cache";

/** The Clerk instance shared with `ClerkProvider`, for code outside React. */
export const getClerk = () =>
  getClerkInstance({ publishableKey: clerkPublishableKey, tokenCache });

/** The signed-in User's Clerk id; throws when nobody is signed in. */
export const getCurrentUserId = (): string => {
  const userId = getClerk().user?.id;

  if (!userId) {
    throw new Error("Not authenticated");
  }

  return userId;
};

const clerkErrorSchema = z
  .unknown()
  .transform((input) => (isClerkAPIResponseError(input) ? input : null));

type ClerkError = z.infer<typeof clerkErrorSchema>;

const formatClerkErrorMessage = (error: ClerkError): string => {
  if (error !== null) {
    const [first] = error.errors;

    return (
      first?.longMessage ?? first?.message ?? i18n.t("common.genericError")
    );
  }

  return i18n.t("common.genericError");
};

/**
 * A message for a Clerk error that can be shown to the User as is: Clerk's
 * own (in English), or the app's generic one in the App language.
 */
const clerkMessageSchema = clerkErrorSchema.transform(formatClerkErrorMessage);

export const getClerkErrorMessage = (error: unknown) =>
  clerkMessageSchema.parse(error);

/**
 * Whether a Clerk call failed because the device couldn't reach Clerk:
 * Clerk's own `network_error`, or the `fetch` underneath it failing (React
 * Native's `Network request failed`, expo/fetch's `fetch failed: …`). Such a
 * failure is the User's connection, never reported; a bug's `TypeError` is.
 */
export const isClerkNetworkFailure = (error: unknown): boolean =>
  (isClerkRuntimeError(error) && error.code === "network_error") ||
  (error instanceof TypeError &&
    (error.message === "Network request failed" ||
      error.message.startsWith("fetch failed:")));
