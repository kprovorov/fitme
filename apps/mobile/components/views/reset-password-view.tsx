import { useSignIn } from "@clerk/expo";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { AuthHeader } from "~/components/auth/auth-header";
import { AuthSwitch } from "~/components/auth/auth-links";
import { type AuthFormParts, AuthScreen } from "~/components/auth/auth-screen";
import { getAuthErrorMessage } from "~/components/auth/error";
import { useAuthOperation } from "~/components/auth/operation";
import { supportsEmailChallenge } from "~/components/auth/verification";
import ResetPasswordForm, {
  type ResetPasswordFormValues,
} from "~/components/forms/auth/reset-password-form";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
export default function ResetPasswordView() {
  const startOver = () =>
    router.replace(operation.error ? "/auth/login" : "/auth/forgot-password");
  const finishPassword = async () => {
    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) {
      return getAuthErrorMessage(finalizeError);
    }
  };
  const sendDeviceCode = async (current: () => boolean) => {
    const { error: sendError } = await signIn.mfa.sendEmailCode();
    if (!current()) {
      return;
    }
    if (sendError) {
      return getAuthErrorMessage(sendError);
    }
    router.push({
      params: { purpose: "sign-in", source: "reset-password" },
      pathname: "/auth/verify-code",
    });
  };
  const submitPassword = ({ password }: ResetPasswordFormValues) =>
    operation.run("email", async (current) => {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
      });
      if (!current()) {
        return;
      }
      if (error) {
        return getAuthErrorMessage(error);
      }
      if (signIn.status === "complete") {
        return finishPassword();
      }
      if (
        supportsEmailChallenge(signIn.status, signIn.supportedSecondFactors)
      ) {
        return sendDeviceCode(current);
      }
      return t("resetPassword.passwordChanged");
    });
  const renderForm = ({ action, fields }: AuthFormParts) => (
    <AuthScreen
      action={
        <View className="gap-xs">
          {operation.error ? (
            <ErrorMessage>{operation.error}</ErrorMessage>
          ) : null}
          {action}
        </View>
      }
      footer={
        <AuthSwitch
          disabled={operation.pending !== null}
          href="/auth/login"
          label={t("resetPassword.backToLogin")}
          prompt={t("resetPassword.changedMind")}
        />
      }
    >
      <AuthHeader
        description={t("resetPassword.description")}
        title={t("resetPassword.title")}
      />
      {fields}
    </AuthScreen>
  );
  const { signIn } = useSignIn();
  const { t } = useTranslation();
  const operation = useAuthOperation();
  if (
    signIn.status !== "needs_new_password" &&
    signIn.status !== "complete" &&
    operation.pending === null
  ) {
    return (
      <AuthScreen
        action={
          <Button
            label={
              operation.error
                ? t("resetPassword.backToLogin")
                : t("verifyCode.startOver")
            }
            onPress={startOver}
            size="lg"
          />
        }
      >
        <AuthHeader
          description={operation.error ?? t("verifyCode.expired")}
          title={t("resetPassword.title")}
        />
      </AuthScreen>
    );
  }
  return (
    <ResetPasswordForm
      disabled={operation.pending !== null}
      onEdit={operation.clearError}
      onSubmit={submitPassword}
    >
      {renderForm}
    </ResetPasswordForm>
  );
}
