import { useSignIn } from "@clerk/expo";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { AuthHeader } from "~/components/auth/auth-header";
import { AuthSwitch } from "~/components/auth/auth-links";
import { AuthScreen } from "~/components/auth/auth-screen";
import type { AuthFormParts } from "~/components/auth/auth-screen";
import { getAuthErrorMessage } from "~/components/auth/error";
import { useAuthOperation } from "~/components/auth/operation";
import ForgotPasswordForm from "~/components/forms/auth/forgot-password-form";
import type { ForgotPasswordFormValues } from "~/components/forms/auth/forgot-password-form";
import { ErrorMessage } from "~/components/ui/error-message";

const ForgotPasswordView = () => {
  const { signIn } = useSignIn();
  const { t } = useTranslation();
  const operation = useAuthOperation();
  const { clearError: handleEdit } = operation;

  const requestCode = ({ email }: ForgotPasswordFormValues) =>
    operation.run("email", async (current) => {
      const { error } = await signIn.create({ identifier: email });

      if (!current()) {
        return;
      }

      if (error) {
        return getAuthErrorMessage(error);
      }

      const { error: sendError } =
        await signIn.resetPasswordEmailCode.sendCode();

      if (!current()) {
        return;
      }

      if (sendError) {
        return getAuthErrorMessage(sendError);
      }

      router.push({
        params: { purpose: "reset-password" },
        pathname: "/auth/verify-code",
      });
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
          label={t("forgotPassword.login")}
          prompt={t("forgotPassword.remember")}
        />
      }
      spacing="lg"
    >
      <AuthHeader
        description={t("forgotPassword.description")}
        title={t("forgotPassword.title")}
      />
      {fields}
    </AuthScreen>
  );

  return (
    <ForgotPasswordForm
      disabled={operation.pending !== null}
      onEdit={handleEdit}
      onSubmit={requestCode}
    >
      {renderForm}
    </ForgotPasswordForm>
  );
};

export default ForgotPasswordView;
