import { useSignInWithApple } from "@clerk/expo/apple";
import { useSignInWithGoogle } from "@clerk/expo/google";
import type { StartGoogleAuthenticationFlowReturnType } from "@clerk/expo/google";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { router } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { analytics } from "~/lib/analytics";
import type { SocialProvider } from "~/lib/sign-in-providers";

const nativeCancellationSchema = z.object({
  code: z.enum(["ERR_REQUEST_CANCELED", "SIGN_IN_CANCELLED", "-5"]),
});

type NativeResult = StartGoogleAuthenticationFlowReturnType;

const nativeResult = async (
  start: () => Promise<NativeResult>
): Promise<NativeResult> => {
  try {
    return await start();
  } catch (error) {
    if (nativeCancellationSchema.safeParse(error).success) {
      return { createdSessionId: null };
    }

    throw error;
  }
};

// Native Clerk hooks return legacy resources. Keep that SDK boundary inside this adapter.
const signInSnapshot = (attempt: NativeResult["signIn"]) =>
  JSON.stringify([
    attempt?.id,
    attempt?.status,
    attempt?.firstFactorVerification.status,
  ]);

const signUpSnapshot = (attempt: NativeResult["signUp"]) =>
  JSON.stringify([
    attempt?.id,
    attempt?.status,
    attempt?.verifications.externalAccount.status,
  ]);

export const useNativeSocialAuth = () => {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { t } = useTranslation();

  const completeSignUp = useCallback(
    async (result: NativeResult, current: () => boolean) => {
      const attempt = result.signUp;

      if (!attempt) {
        return t("auth.social.incomplete");
      }

      const fields = [...attempt.missingFields, ...attempt.unverifiedFields];

      if (
        !(
          fields.length > 0 &&
          fields.every((field) => field === "email_address") &&
          attempt.emailAddress
        )
      ) {
        return t("auth.social.incomplete");
      }

      await attempt.prepareEmailAddressVerification({ strategy: "email_code" });

      if (current()) {
        router.push({
          params: { purpose: "sign-up" },
          pathname: "/auth/verify-code",
        });
      }
    },
    [t]
  );

  const completeSignIn = useCallback(
    async (result: NativeResult, current: () => boolean) => {
      const attempt = result.signIn;

      const emailFactor = attempt?.supportedSecondFactors?.find(
        (factor) => factor.strategy === "email_code"
      );

      if (!(attempt && emailFactor?.strategy === "email_code")) {
        return t("auth.login.cantSignInHere");
      }

      await attempt.prepareSecondFactor({
        emailAddressId: emailFactor.emailAddressId,
        strategy: "email_code",
      });

      if (current()) {
        router.push({
          params: { purpose: "sign-in", source: "social" },
          pathname: "/auth/verify-code",
        });
      }
    },
    [t]
  );

  const activate = useCallback(
    async (result: NativeResult, current: () => boolean) => {
      if (!(result.createdSessionId && result.setActive)) {
        return t("auth.social.incomplete");
      }

      await result.setActive({ session: result.createdSessionId });

      void analytics.send(
        result.signUp?.createdSessionId === result.createdSessionId
          ? "User Registered"
          : "User Logged In"
      );

      if (current()) {
        router.replace("/");
      }
    },
    [t]
  );

  return useCallback(
    async (
      provider: SocialProvider,
      current: () => boolean
    ): Promise<string | undefined> => {
      const beforeSignIn = signInSnapshot(signIn);
      const beforeSignUp = signUpSnapshot(signUp);

      const result = await nativeResult(
        provider === "apple"
          ? startAppleAuthenticationFlow
          : startGoogleAuthenticationFlow
      );

      if (!current()) {
        return;
      }

      if (result.createdSessionId) {
        return await activate(result, current);
      }

      const changedSignIn =
        !!result.signIn && beforeSignIn !== signInSnapshot(result.signIn);

      const changedSignUp =
        !!result.signUp && beforeSignUp !== signUpSnapshot(result.signUp);

      if (!(changedSignIn || changedSignUp)) {
        return;
      }

      if (changedSignUp && result.signUp?.status === "missing_requirements") {
        return await completeSignUp(result, current);
      }

      if (
        changedSignIn &&
        (result.signIn?.status === "needs_second_factor" ||
          result.signIn?.status === "needs_client_trust")
      ) {
        return await completeSignIn(result, current);
      }

      return t("auth.social.incomplete");
    },
    [
      activate,
      completeSignIn,
      completeSignUp,
      signIn,
      signUp,
      startAppleAuthenticationFlow,
      startGoogleAuthenticationFlow,
      t,
    ]
  );
};
