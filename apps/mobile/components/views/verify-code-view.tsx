import { useSignIn, useSignUp, useUser } from "@clerk/expo";
import { captureException } from "@sentry/react-native";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, AppState, Pressable, View } from "react-native";

import { AuthHeader } from "~/components/auth/auth-header";
import { AuthSwitch } from "~/components/auth/auth-links";
import { AuthScreen } from "~/components/auth/auth-screen";
import { CodeInput } from "~/components/auth/code-input";
import { getAuthErrorMessage } from "~/components/auth/error";
import { useAuthOperation } from "~/components/auth/operation";
import type {
  CodePurpose,
  VerificationSource,
} from "~/components/auth/verification";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { isWrongCodeError } from "~/hooks/confirm-identity";
import { useReverifiedCall } from "~/hooks/reverification";
import { isClerkNetworkFailure } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { dropUnusedEmailAddress } from "~/lib/email-addresses";
import { segmentClient } from "~/lib/segment";
import { showToast } from "~/lib/toast";

const RESEND_DELAY = 60_000;

interface CodeVerification {
  available: boolean;
  email: string | null;
  id: string | null;
  resend: () => Promise<string | undefined>;
  /** `cancelled`: the User backed out of "Confirm it's you"; stay put. */
  reset: () => Promise<{
    cancelled?: boolean;
    error: unknown;
  }>;
  verify: (code: string, current: () => boolean) => Promise<string | undefined>;
}

const useSignUpVerification = (): CodeVerification => {
  const { signUp } = useSignUp();
  const { t } = useTranslation();

  return {
    available:
      !!signUp.id &&
      !!signUp.emailAddress &&
      (signUp.status === "complete" ||
        (signUp.status === "missing_requirements" &&
          signUp.unverifiedFields.includes("email_address"))),
    email: signUp.emailAddress,
    id: signUp.id ?? null,
    resend: async () => {
      const { error } = await signUp.verifications.sendEmailCode();

      return error ? getAuthErrorMessage(error) : undefined;
    },
    reset: () => signUp.reset(),
    verify: async (code, current) => {
      const { error } = await signUp.verifications.verifyEmailCode({ code });

      if (!current()) {
        return;
      }

      if (error) {
        return getAuthErrorMessage(error);
      }

      if (signUp.status !== "complete") {
        return t("verifyCode.errors.signUpIncomplete");
      }

      const { error: finalizeError } = await signUp.finalize();

      if (finalizeError) {
        return getAuthErrorMessage(finalizeError);
      }

      if (!IS_E2E) {
        void segmentClient.track("User Registered");
      }
    },
  };
};

const useResetPasswordVerification = (): CodeVerification => {
  const { signIn } = useSignIn();
  const { t } = useTranslation();

  return {
    available:
      !!signIn.id &&
      !!signIn.identifier &&
      (signIn.status === "needs_new_password" ||
        (signIn.status === "needs_first_factor" &&
          signIn.supportedFirstFactors.some(
            (factor) => factor.strategy === "reset_password_email_code"
          ))),
    email: signIn.identifier,
    id: signIn.id ?? null,
    resend: async () => {
      const { error } = await signIn.resetPasswordEmailCode.sendCode();

      return error ? getAuthErrorMessage(error) : undefined;
    },
    reset: () => signIn.reset(),
    verify: async (code, current) => {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({
        code,
      });

      if (!current()) {
        return;
      }

      if (error) {
        return getAuthErrorMessage(error);
      }

      if (signIn.status !== "needs_new_password") {
        return t("verifyCode.errors.resetIncomplete");
      }

      router.replace("/auth/reset-password");
    },
  };
};

const useSignInVerification = (
  source: VerificationSource
): CodeVerification => {
  const { signIn } = useSignIn();
  const { t } = useTranslation();

  return {
    available:
      !!signIn.id &&
      !!signIn.identifier &&
      (signIn.status === "complete" ||
        ((signIn.status === "needs_client_trust" ||
          signIn.status === "needs_second_factor") &&
          signIn.supportedSecondFactors.some(
            (factor) => factor.strategy === "email_code"
          ))),
    email: signIn.identifier,
    id: signIn.id ?? null,
    resend: async () => {
      const { error } = await signIn.mfa.sendEmailCode();

      return error ? getAuthErrorMessage(error) : undefined;
    },
    reset: () => signIn.reset(),
    verify: async (code, current) => {
      const { error } = await signIn.mfa.verifyEmailCode({ code });

      if (!current()) {
        return;
      }

      if (error) {
        return getAuthErrorMessage(error);
      }

      if (signIn.status !== "complete") {
        return t("verifyCode.errors.signInIncomplete");
      }

      const { error: finalizeError } = await signIn.finalize();

      if (finalizeError) {
        return getAuthErrorMessage(finalizeError);
      }

      if (source !== "reset-password" && !IS_E2E) {
        void segmentClient.track("User Logged In");
      }
    },
  };
};

/** Where a changed email takes the User back to. */
const ACCOUNT_SECURITY_ROUTE = "/account-security";

/**
 * Change Email's code step (`purpose=change-email`): the code went to the
 * address the User is adding (`emailAddressId`). Once Clerk verifies it, it
 * becomes the primary address (through "Confirm it's you" when Clerk asks)
 * and the old one is destroyed, so reset codes never go to an address
 * the User has left. Then the User is back on Account & Security with a
 * toast. Leaving before that ("Change it", back, a swipe) takes the new
 * address off the account, leaving the old one primary.
 */
const useChangeEmailVerification = (
  emailAddressId: string
): CodeVerification => {
  const { user } = useUser();
  const { t } = useTranslation();
  const settled = useRef(false);
  const address = user?.emailAddresses.find(({ id }) => id === emailAddressId);

  // Removing an email address is a sensitive action too: "Change it" asks
  // "Confirm it's you" when the session has gone stale on this Screen.
  const removeAddress = useReverifiedCall(
    async (target: { destroy: () => Promise<unknown> }) =>
      await target.destroy()
  );

  const makePrimary = useReverifiedCall(
    async (id: string) => await user?.update({ primaryEmailAddressId: id })
  );

  // The address leaves the account with the Screen, unless it was made
  // primary or the User already took it off ("Change it"). Deferred a tick,
  // so a remount (React's strict mode) keeps it.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      setTimeout(() => {
        if (!(alive.current || settled.current)) {
          void dropUnusedEmailAddress(emailAddressId);
        }
      }, 0);
    };
  }, [emailAddressId]);

  return {
    // Still shown once the address is primary, while the old one goes.
    available: !!user && !!address,
    email: address?.emailAddress ?? null,
    id: address?.id ?? null,
    resend: async () => {
      try {
        await address?.prepareVerification({ strategy: "email_code" });
      } catch (error) {
        return getAuthErrorMessage(error);
      }
    },
    reset: async () => {
      try {
        if (address) {
          const removed = await removeAddress(address);

          if (removed.status === "cancelled") {
            return { cancelled: true, error: null };
          }
        }

        // Taken off: leaving the Screen has nothing left to drop.
        settled.current = true;

        return { error: null };
      } catch (error) {
        return { error };
      }
    },
    verify: async (code, current) => {
      if (!(user && address)) {
        return t("verifyCode.errors.changeEmailIncomplete");
      }

      // A code already taken (a swap that failed after it) isn't asked again.
      if (address.verification.status !== "verified") {
        try {
          await address.attemptVerification({ code });
        } catch (error) {
          return isWrongCodeError(error)
            ? t("confirmIdentity.errors.wrongCode")
            : getAuthErrorMessage(error);
        }
      }

      if (!current()) {
        return;
      }

      const previousId = user.primaryEmailAddressId;
      const swapped = await makePrimary(emailAddressId);

      // Cancelled "Confirm it's you": the new address stays verified, and
      // Verify swaps it without another code.
      if (swapped.status === "cancelled") {
        return;
      }

      settled.current = true;

      const previous = swapped.value?.emailAddresses.find(
        ({ id }) => id === previousId
      );

      // The old address goes even if the User has left meanwhile: the
      // session was just confirmed, so Clerk doesn't ask again. A failure
      // is ours to look into, not the User's to retry: the new address is
      // primary already.
      try {
        await previous?.destroy();
      } catch (error) {
        if (!isClerkNetworkFailure(error)) {
          captureException(error);
        }
      }

      if (!current()) {
        return;
      }

      showToast(t("changeEmail.success", { email: address.emailAddress }));
      router.dismissTo(ACCOUNT_SECURITY_ROUTE);
    },
  };
};

const CodeVerificationContent = ({
  flow,
  purpose,
}: {
  flow: CodeVerification;
  purpose: CodePurpose;
}) => {
  const { t } = useTranslation();
  const operation = useAuthOperation();
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string>();
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_DELAY);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const coolingDown = remaining > 0;
  useEffect(() => {
    if (!(flow.available && coolingDown)) {
      return;
    }

    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener("change", update);

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [flow.available, coolingDown]);

  let restartHref: "/auth/forgot-password" | "/auth/login" | "/auth/register" =
    "/auth/forgot-password";

  if (purpose === "sign-up") {
    restartHref = "/auth/register";
  } else if (purpose === "sign-in") {
    restartHref = "/auth/login";
  }

  // Change Email's own form is the Screen under this one.
  const changingEmail = purpose === "change-email";

  const restart = useCallback(
    () =>
      operation.run("restart", async (current) => {
        const { cancelled, error } = await flow.reset();

        if (!current() || cancelled) {
          return;
        }

        if (error) {
          return getAuthErrorMessage(error);
        }

        if (changingEmail) {
          router.back();
        } else {
          router.replace(restartHref);
        }
      }),
    [changingEmail, flow, operation, restartHref]
  );

  const handleVerify = useCallback(
    () =>
      operation.run("verify", (current) => {
        setNotice(undefined);

        return flow.verify(code, current);
      }),
    [code, flow, operation]
  );

  const changeCode = useCallback(
    (value: string) => {
      setCode(value);
      setNotice(undefined);
      operation.clearError();
    },
    [operation]
  );

  const resendCode = useCallback(
    () =>
      operation.run("resend", async (current) => {
        setNotice(undefined);
        const error = await flow.resend();

        if (!current()) {
          return;
        }

        if (error) {
          return error;
        }

        setCode("");
        setResendAt(Date.now() + RESEND_DELAY);
        setNow(Date.now());
        setNotice(t("verifyCode.resentNotice"));
      }),
    [flow, operation, t]
  );

  if (!flow.available) {
    return (
      <AuthScreen
        action={
          <Button
            disabled={operation.pending !== null}
            isLoading={operation.pending === "restart"}
            label={t("verifyCode.startOver")}
            onPress={(...args) => {
              void restart(...args);
            }}
            size="lg"
          />
        }
        spacing="lg"
      >
        <AuthHeader
          description={t("verifyCode.expired")}
          mark={!changingEmail}
          title={t("verifyCode.title")}
        />
        {operation.error ? (
          <ErrorMessage>{operation.error}</ErrorMessage>
        ) : null}
      </AuthScreen>
    );
  }

  const resending = operation.pending === "resend";
  const resendDisabled = remaining > 0 || operation.pending !== null;

  const resendLabel =
    remaining > 0
      ? t("verifyCode.resendIn", {
          time: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`,
        })
      : t("verifyCode.resendButton");

  return (
    <AuthScreen
      action={
        <View className="gap-xs">
          {operation.error ? (
            <ErrorMessage testID="verify-code-error">
              {operation.error}
            </ErrorMessage>
          ) : null}
          <Button
            accessibilityLabel={t(
              operation.pending === "verify"
                ? "verifyCode.loading"
                : "verifyCode.verify"
            )}
            disabled={code.length !== 6 || operation.pending !== null}
            isLoading={operation.pending === "verify"}
            label={t("verifyCode.verify")}
            onPress={(...args) => {
              void handleVerify(...args);
            }}
            size="lg"
            testID="verify-code-button"
          />
        </View>
      }
      footer={
        <AuthSwitch
          disabled={operation.pending !== null}
          href={restartHref}
          label={t("verifyCode.changeEmail")}
          onPress={(...args) => {
            void restart(...args);
          }}
          prompt={t("verifyCode.wrongEmail")}
        />
      }
      spacing="lg"
    >
      <AuthHeader
        description={t("verifyCode.destination", { email: flow.email })}
        mark={!changingEmail}
        title={t("verifyCode.title")}
      />
      <View className="gap-sm">
        <CodeInput
          disabled={operation.pending !== null}
          error={!!operation.error}
          label={t("verifyCode.codePlaceholder")}
          onChange={changeCode}
          value={code}
        />
        <View className="flex-row flex-wrap items-center gap-x-1">
          <Text className="text-footnote" variant="muted">
            {t("verifyCode.didntGet")}
          </Text>
          {/* Figma's Resend: a Footnote Emphasized text link in a 44 pt row. */}
          <Pressable
            accessibilityLabel={resendLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: resending, disabled: resendDisabled }}
            className="min-h-11 justify-center"
            disabled={resendDisabled}
            onPress={resendCode}
            testID="verify-code-resend-button"
          >
            {resending ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <Text className="text-footnote-emphasized" variant="muted">
                {resendLabel}
              </Text>
            )}
          </Pressable>
        </View>
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-footnote"
            variant="muted"
          >
            {notice}
          </Text>
        ) : null}
      </View>
    </AuthScreen>
  );
};

const AuthCodeView = ({
  purpose,
  source = "reset-password",
}: {
  purpose: Exclude<CodePurpose, "change-email">;
  source?: VerificationSource;
}) => {
  // Named calls keep React Compiler from memoizing a selected hook as a plain function.
  const verifications: Record<
    Exclude<CodePurpose, "change-email">,
    CodeVerification
  > = {
    "reset-password": useResetPasswordVerification(),
    "sign-in": useSignInVerification(source),
    "sign-up": useSignUpVerification(),
  };

  const flow = verifications[purpose];

  return (
    <CodeVerificationContent
      flow={flow}
      key={`${purpose}:${flow.id}`}
      purpose={purpose}
    />
  );
};

const ChangeEmailCodeView = ({
  emailAddressId,
}: {
  emailAddressId: string;
}) => {
  const flow = useChangeEmailVerification(emailAddressId);

  return <CodeVerificationContent flow={flow} purpose="change-email" />;
};

const VerifyCodeView = (
  props:
    | { emailAddressId: string; purpose: "change-email" }
    | {
        purpose: Exclude<CodePurpose, "change-email">;
        source?: VerificationSource;
      }
) =>
  props.purpose === "change-email" ? (
    <ChangeEmailCodeView emailAddressId={props.emailAddressId} />
  ) : (
    <AuthCodeView purpose={props.purpose} source={props.source} />
  );

export default VerifyCodeView;
