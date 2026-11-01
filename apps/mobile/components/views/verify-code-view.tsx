import { useSignIn, useSignUp } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, View } from "react-native";
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
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

const RESEND_DELAY = 60_000;
interface CodeVerification {
  available: boolean;
  email: string | null;
  id: string | null;
  resend: () => Promise<string | undefined>;
  reset: () => Promise<{
    error: unknown;
  }>;
  verify: (code: string, current: () => boolean) => Promise<string | undefined>;
}
function useSignUpVerification(): CodeVerification {
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
        segmentClient.track("User Registered");
      }
    },
  };
}
function useResetPasswordVerification(): CodeVerification {
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
}
function useSignInVerification(source: VerificationSource): CodeVerification {
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
        segmentClient.track("User Logged In");
      }
    },
  };
}
export default function VerifyCodeView({
  purpose,
  source = "reset-password",
}: {
  purpose: CodePurpose;
  source?: VerificationSource;
}) {
  // Named calls keep React Compiler from memoizing a selected hook as a plain function.
  const verifications: Record<CodePurpose, CodeVerification> = {
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
}

function CodeVerificationContent({
  flow,
  purpose,
}: {
  flow: CodeVerification;
  purpose: CodePurpose;
}) {
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
  const restartHref =
    purpose === "sign-up"
      ? "/auth/register"
      : purpose === "sign-in"
        ? "/auth/login"
        : "/auth/forgot-password";
  const restart = useCallback(
    () =>
      operation.run("restart", async (current) => {
        const { error } = await flow.reset();
        if (!current()) {
          return;
        }
        if (error) {
          return getAuthErrorMessage(error);
        }
        router.replace(restartHref);
      }),
    [flow, operation, restartHref]
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
            onPress={restart}
            size="lg"
          />
        }
      >
        <AuthHeader
          description={t("verifyCode.expired")}
          title={t("verifyCode.title")}
        />
        {operation.error ? (
          <ErrorMessage>{operation.error}</ErrorMessage>
        ) : null}
      </AuthScreen>
    );
  }
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
            onPress={handleVerify}
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
          onPress={restart}
          prompt={t("verifyCode.wrongEmail")}
        />
      }
    >
      <AuthHeader
        description={t("verifyCode.destination", { email: flow.email })}
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
          <Text className="text-footnote text-muted-foreground">
            {t("verifyCode.didntGet")}
          </Text>
          <Button
            contentColorClassName="text-muted-foreground"
            disabled={remaining > 0 || operation.pending !== null}
            isLoading={operation.pending === "resend"}
            label={
              remaining > 0
                ? t("verifyCode.resendIn", {
                    time: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`,
                  })
                : t("verifyCode.resendButton")
            }
            onPress={resendCode}
            size="lg"
            testID="verify-code-resend-button"
            variant="ghost"
          />
        </View>
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-footnote text-muted-foreground"
          >
            {notice}
          </Text>
        ) : null}
      </View>
    </AuthScreen>
  );
}
