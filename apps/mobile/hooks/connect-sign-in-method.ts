import { isClerkAPIResponseError, useUser } from "@clerk/expo";
import { captureException } from "@sentry/react-native";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import { useReverifiedCall } from "~/hooks/reverification";
import { getClerk, isClerkNetworkFailure } from "~/lib/clerk";
import { openAuthSession } from "~/lib/external-links";
import { PROVIDER_NAMES } from "~/lib/sign-in-providers";
import type { SocialProvider } from "~/lib/sign-in-providers";

/**
 * Where the provider's sign-in sends the in-app browser back to: the app's
 * own scheme, at the screen Connect runs on. Clerk's native redirects must
 * be allow-listed on each instance.
 */
export const SIGN_IN_METHOD_REDIRECT_URL = "fitme://account-security";

/** Clerk's answer when the provider's account is another User's already. */
const ALREADY_LINKED = "external_account_exists";

/** The alert a failed Connect shows (`accountSecurity.errors.<failure>`). */
type Failure = "alreadyLinked" | "appleUnavailable" | "connectFailed";

/**
 * How Clerk (or the provider) refused: Clerk's code, and whether it was a
 * refusal at all (a Clerk 4xx or a failed verification) rather than our own
 * bug, Clerk's 5xx or the User's connection.
 */
interface Refusal {
  readonly code: string | undefined;
  readonly refused: boolean;
}

const failureOf = (provider: SocialProvider, refusal: Refusal): Failure => {
  if (refusal.code === ALREADY_LINKED) {
    return "alreadyLinked";
  }

  // Apple's browser sign-in needs a Services ID in Clerk (a human task,
  // ADR 0021): until then Clerk or Apple refuses it.
  if (provider === "apple" && refusal.refused) {
    return "appleUnavailable";
  }

  return "connectFailed";
};

/** Whether the User who started a Connect is still the one signed in. */
const isStillSignedIn = (userId: string | undefined) =>
  userId !== undefined && getClerk().user?.id === userId;

const refusalOf = (error: unknown): Refusal => {
  if (isClerkAPIResponseError(error)) {
    return { code: error.errors[0]?.code, refused: error.status < 500 };
  }

  return { code: undefined, refused: false };
};

/**
 * Connects a sign-in method to the signed-in User (ADR 0021): through
 * "Confirm it's you" when Clerk asks, it creates the external account, runs
 * the provider's sign-in in the in-app browser, then reloads the User, whose
 * verified account is the answer. Closing the browser changes nothing and
 * says nothing; a failure says so in an alert. A link left unverified is
 * taken back off the User, so a retry starts clean. `connecting` is the
 * provider in progress, `null` when none is; only one runs at a time.
 */
export const useConnectSignInMethod = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const [connecting, setConnecting] = useState<SocialProvider | null>(null);
  // Set at once, so a second tap in the same frame never starts a second one.
  const running = useRef(false);

  const createExternalAccount = useReverifiedCall(
    async (provider: SocialProvider) => {
      if (!user) {
        throw new Error("No signed-in User to connect a sign-in method to");
      }

      return await user.createExternalAccount({
        redirectUrl: SIGN_IN_METHOD_REDIRECT_URL,
        strategy: `oauth_${provider}`,
      });
    }
  );

  const showFailure = useCallback(
    (provider: SocialProvider, failure: Failure) => {
      Alert.alert(
        t(`accountSecurity.errors.${failure}`, {
          provider: PROVIDER_NAMES[provider],
        })
      );
    },
    [t]
  );

  const connectOnce = useCallback(
    async (provider: SocialProvider, startedBy: string | undefined) => {
      const created = await createExternalAccount(provider);

      // Cancelled, or signed out (or another account) while Clerk answered:
      // no sign-in is theirs to open now.
      if (created.status === "cancelled" || !isStillSignedIn(startedBy)) {
        return;
      }

      const link = created.value;
      const url = link.verification?.externalVerificationRedirectURL;

      if (!url) {
        throw new Error(`Clerk gave no ${provider} sign-in to open`);
      }

      const browserOutcome = await openAuthSession(
        url.toString(),
        SIGN_IN_METHOD_REDIRECT_URL
      );

      // Signed out, or another account, while the browser was up: nothing
      // here is theirs to show.
      if (!isStillSignedIn(startedBy)) {
        return;
      }

      // The browser only says it came back: Clerk says whether it linked.
      const reloaded = await user?.reload();

      const verification = reloaded?.externalAccounts.find(
        ({ id }) => id === link.id
      )?.verification;

      if (verification?.status === "verified") {
        return;
      }

      // An unverified link would sit on the User for every try; a failed
      // clean-up costs nothing the User can see.
      try {
        await link.destroy();
      } catch {
        // The next Connect makes its own.
      }

      const code = verification?.error?.code;

      // Closed before the provider answered: the User backed out. Or the
      // User changed meanwhile, and the failure isn't theirs to see.
      if (
        (browserOutcome === "closed" && code === undefined) ||
        !isStillSignedIn(startedBy)
      ) {
        return;
      }

      showFailure(
        provider,
        failureOf(provider, { code, refused: code !== undefined })
      );
    },
    [createExternalAccount, showFailure, user]
  );

  const connect = useCallback(
    async (provider: SocialProvider) => {
      if (running.current) {
        return;
      }

      running.current = true;
      setConnecting(provider);
      const startedBy = user?.id;

      try {
        await connectOnce(provider, startedBy);
      } catch (error) {
        const refusal = refusalOf(error);

        // The User's connection, an account linked elsewhere or Apple's
        // missing setup are expected; anything else is ours to look at.
        if (!(isClerkNetworkFailure(error) || refusal.refused)) {
          captureException(error);
        }

        // Signed out, or another account, before it failed: nothing to say.
        if (isStillSignedIn(startedBy)) {
          showFailure(provider, failureOf(provider, refusal));
        }
      }

      running.current = false;
      setConnecting(null);
    },
    [connectOnce, showFailure, user]
  );

  return { connect, connecting };
};
