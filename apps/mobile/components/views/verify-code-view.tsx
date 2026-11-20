import { useSignIn, useSignUp, useUser } from "@clerk/expo";
import { captureException } from "@sentry/react-native";
import { router, usePreventRemove } from "expo-router";
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
import { getClerk, isClerkNetworkFailure } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { dropUnusedEmailAddress } from "~/lib/email-addresses";
import { segmentClient } from "~/lib/segment";
import { showToast } from "~/lib/toast";

const RESEND_DELAY = 60_000;
const CODE_LENGTH = 6;

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
/** Change Email's flow, plus what guards leaving its code screen. */
interface ChangeEmailVerification extends CodeVerification {
  /** Whether leaving now would leave the new address behind. */
  readonly guarded: boolean;
  /**
   * Takes the new address off before the Screen goes (through "Confirm
   * it's you" when Clerk asks); answers whether the User stays (cancelled).
   */
  readonly leave: () => Promise<boolean>;
}

const useChangeEmailVerification = (
  emailAddressId: string
): ChangeEmailVerification => {
  const { user } = useUser();
  const { t } = useTranslation();
  const settled = useRef(false);
  const address = user?.emailAddresses.find(({ id }) => id === emailAddressId);
  // The address the User is leaving, kept across a retry: once the swap
  // lands, it's no longer the primary one.
  const [previousId, setPreviousId] = useState<string | null>(null);

  // Removing an email address is a sensitive action too: "Change it" asks
  // "Confirm it's you" when the session has gone stale on this Screen.
  const removeAddress = useReverifiedCall(
    async (target: { destroy: () => Promise<unknown> }) =>
      await target.destroy()
  );

  const makePrimary = useReverifiedCall(
    async (id: string) => await user?.update({ primaryEmailAddressId: id })
  );

  // Back and a swipe take the address off through `leave` first; this is
  // the fallback for any other way out (a deep link, a sign-out): the
  // address leaves the account with the Screen, unless it was made primary
  // or already taken off. Deferred a tick, so a remount (React's strict
  // mode) keeps it.
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

  const isPrimary = user?.primaryEmailAddressId === emailAddressId;

  // Swapped, but the old address is still on the account (its removal
  // failed): leaving takes it off as well.
  const oldAddress = isPrimary
    ? user?.emailAddresses.find(
        ({ id }) => id === previousId && id !== emailAddressId
      )
    : undefined;

  return {
    // Still shown once the address is primary, while the old one goes.
    available: !!user && !!address,
    email: address?.emailAddress ?? null,
    guarded: !!address && (!isPrimary || !!oldAddress),
    id: address?.id ?? null,
    leave: async () => {
      // Whichever address the change would leave behind, as Clerk has the
      // account now (a render can lag a removal that just landed): the new
      // one before the swap, the old one after it.
      const current = getClerk().user;
      const swapped = current?.primaryEmailAddressId === emailAddressId;

      const target = current?.emailAddresses.find(({ id }) =>
        swapped
          ? id === previousId && id !== emailAddressId
          : id === emailAddressId
      );

      if (!target || (settled.current && !swapped)) {
        return false;
      }

      try {
        const removed = await removeAddress(target);

        if (removed.status === "cancelled") {
          return true;
        }

        settled.current = true;
      } catch (error) {
        if (!isClerkNetworkFailure(error)) {
          captureException(error);
        }

        // After the swap the old address must go before the User does: once
        // the Screen is gone, nothing knows it's left over, and it could
        // still get a reset code. So they stay, told why, and try again.
        // A verified address the swap never reached (it failed, or "Confirm
        // it's you" was cancelled) is the same: a code can't add it again.
        if (swapped || target.verification.status === "verified") {
          showToast(t("changeEmail.errors.failed"));

          return true;
        }

        // An unverified new address is harmless: the User goes, and the
        // unmount fallback tries again.
      }

      return false;
    },
    resend: async () => {
      try {
        await address?.prepareVerification({ strategy: "email_code" });
      } catch (error) {
        return getAuthErrorMessage(error);
      }
    },
    reset: async () => {
      // After the swap the new address is primary and can't go: what's left
      // to take off is the old one.
      const target = isPrimary ? oldAddress : address;

      try {
        if (target) {
          const removed = await removeAddress(target);

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

      const leaving = previousId ?? user.primaryEmailAddressId;
      setPreviousId(leaving);

      if (user.primaryEmailAddressId !== emailAddressId) {
        const swapped = await makePrimary(emailAddressId);

        // Cancelled "Confirm it's you": the new address stays verified, and
        // Verify swaps it without another code.
        if (swapped.status === "cancelled") {
          return;
        }
      }

      settled.current = true;

      // The change isn't done until the old address is gone: while it's on
      // the account it can still receive a reset code. A failure keeps the
      // User here to try again; nothing is reported done before that.
      const previous = getClerk().user?.emailAddresses.find(
        ({ id }) => id === leaving && id !== emailAddressId
      );

      if (previous) {
        try {
          const removed = await removeAddress(previous);

          if (removed.status === "cancelled") {
            return;
          }
        } catch (error) {
          if (!isClerkNetworkFailure(error)) {
            captureException(error);
          }

          return t("changeEmail.errors.failed");
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

  const verify = useCallback(
    (value: string) =>
      operation.run("verify", (current) => {
        setNotice(undefined);

        return flow.verify(value, current);
      }),
    [flow, operation]
  );

  const handleVerify = useCallback(() => verify(code), [code, verify]);

  // The 6th digit (typed, pasted or AutoFilled) submits the code once. A
  // change that leaves the code as it was (a wrong code still in the field)
  // submits nothing: Verify retries it.
  const changeCode = useCallback(
    (value: string) => {
      const changed = value !== code;
      setCode(value);
      setNotice(undefined);
      operation.clearError();

      if (changed && value.length === CODE_LENGTH) {
        void verify(value);
      }
    },
    [code, operation, verify]
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
            disabled={code.length !== CODE_LENGTH || operation.pending !== null}
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

  // Leaving before verifying (back, a swipe) takes the new address off
  // first, asking "Confirm it's you" when the session has gone stale; a
  // cancel keeps the User here.
  const { leave } = flow;

  const leaveThen = useCallback(
    async (repeat: () => void) => {
      if (!(await leave())) {
        repeat();
      }
    },
    [leave]
  );

  usePreventRemove(flow.guarded, ({ repeat }) => {
    void leaveThen(repeat);
  });

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
