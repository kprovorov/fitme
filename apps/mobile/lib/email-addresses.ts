import { captureException } from "@sentry/react-native";

import { getClerk, isClerkNetworkFailure } from "~/lib/clerk";

/**
 * Takes an email address the User added for Change Email but never made
 * primary back off their account: one they left before verifying, or one
 * whose code was asked for by a form they had already left. The primary
 * address is never touched. A failure is reported, not shown: the User has
 * already left, so there's no Screen to ask "Confirm it's you" on.
 */
export const dropUnusedEmailAddress = async (
  emailAddressId: string
): Promise<void> => {
  const { user } = getClerk();
  const address = user?.emailAddresses.find(({ id }) => id === emailAddressId);

  if (!(user && address) || user.primaryEmailAddressId === emailAddressId) {
    return;
  }

  try {
    await address.destroy();
  } catch (error) {
    if (!isClerkNetworkFailure(error)) {
      captureException(error);
    }
  }
};
