import { getClerkInstance, isClerkAPIResponseError } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";

export const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

export { tokenCache };

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

const FALLBACK_ERROR_MESSAGE = "Something went wrong. Please try again later.";

/** A message for a Clerk error that can be shown to the User as is. */
export const getClerkErrorMessage = (error: unknown): string => {
  if (isClerkAPIResponseError(error)) {
    const [first] = error.errors;
    return first?.longMessage ?? first?.message ?? FALLBACK_ERROR_MESSAGE;
  }
  return FALLBACK_ERROR_MESSAGE;
};
