import { useSignInWithApple } from "@clerk/expo/apple";
import {
  type StartGoogleAuthenticationFlowReturnType,
  useSignInWithGoogle,
} from "@clerk/expo/google";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { isAvailableAsync } from "expo-apple-authentication";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { nativeAuthConfig } from "~/components/auth/provider-config";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

export type SocialProvider = "apple" | "google";
const GOOGLE_CLIENT_ID = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_CLIENT_SUFFIX = /\.apps\.googleusercontent\.com$/;
type NativeResult = StartGoogleAuthenticationFlowReturnType;

export function configuredSocialProviders(): SocialProvider[] {
  const config = nativeAuthConfig();
  const providers: SocialProvider[] = [];
  if (Platform.OS === "ios" && config.appleEnabled) {
    providers.push("apple");
  }
  const iosReady =
    GOOGLE_CLIENT_ID.test(config.googleIosClientId) &&
    config.googleIosUrlScheme ===
      `com.googleusercontent.apps.${config.googleIosClientId.replace(GOOGLE_CLIENT_SUFFIX, "")}`;
  if (
    config.googleEnabled &&
    GOOGLE_CLIENT_ID.test(config.googleWebClientId) &&
    (Platform.OS === "android" || (Platform.OS === "ios" && iosReady))
  ) {
    providers.push("google");
  }
  return providers;
}

export function useAvailableSocialProviders(): SocialProvider[] {
  const configured = configuredSocialProviders();
  const appleConfigured = configured.includes("apple");
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (appleConfigured) {
      isAvailableAsync()
        .then((available) => {
          if (mounted) {
            setAppleAvailable(available);
          }
        })
        .catch(() => {
          if (mounted) {
            setAppleAvailable(false);
          }
        });
    } else {
      setAppleAvailable(false);
    }
    return () => {
      mounted = false;
    };
  }, [appleConfigured]);
  return configured.filter(
    (provider) => provider !== "apple" || appleAvailable
  );
}

async function nativeResult(
  start: () => Promise<NativeResult>
): Promise<NativeResult> {
  try {
    return await start();
  } catch (failure) {
    if (
      failure &&
      typeof failure === "object" &&
      "code" in failure &&
      (failure.code === "ERR_REQUEST_CANCELED" ||
        failure.code === "SIGN_IN_CANCELLED" ||
        failure.code === "-5")
    ) {
      return { createdSessionId: null };
    }
    throw failure;
  }
}

// Native Clerk hooks return legacy resources. Keep that SDK boundary inside this adapter.
function signInSnapshot(attempt: NativeResult["signIn"]) {
  return JSON.stringify([
    attempt?.id,
    attempt?.status,
    attempt?.firstFactorVerification.status,
  ]);
}
function signUpSnapshot(attempt: NativeResult["signUp"]) {
  return JSON.stringify([
    attempt?.id,
    attempt?.status,
    attempt?.verifications.externalAccount.status,
  ]);
}

export function useNativeSocialAuth() {
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
      if (!IS_E2E) {
        segmentClient.track(
          result.signUp?.createdSessionId === result.createdSessionId
            ? "User Registered"
            : "User Logged In"
        );
      }
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
        return activate(result, current);
      }
      const changedSignIn =
        !!result.signIn && beforeSignIn !== signInSnapshot(result.signIn);
      const changedSignUp =
        !!result.signUp && beforeSignUp !== signUpSnapshot(result.signUp);
      if (!(changedSignIn || changedSignUp)) {
        return;
      }
      if (changedSignUp && result.signUp?.status === "missing_requirements") {
        return completeSignUp(result, current);
      }
      if (
        changedSignIn &&
        (result.signIn?.status === "needs_second_factor" ||
          result.signIn?.status === "needs_client_trust")
      ) {
        return completeSignIn(result, current);
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
}
