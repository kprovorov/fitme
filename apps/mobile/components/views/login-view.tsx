import { useSignIn } from "@clerk/expo";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { AuthHeader } from "~/components/auth/auth-header";
import { AuthLegal, AuthSwitch } from "~/components/auth/auth-links";
import { AuthScreen } from "~/components/auth/auth-screen";
import type { AuthFormParts } from "~/components/auth/auth-screen";
import { getAuthErrorMessage } from "~/components/auth/error";
import { useAuthOperation } from "~/components/auth/operation";
import { SocialAuthButtons } from "~/components/auth/social-auth-buttons";
import { supportsEmailChallenge } from "~/components/auth/verification";
import LoginForm from "~/components/forms/auth/login-form";
import type { LoginFormValues } from "~/components/forms/auth/login-form";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { useAvailableSocialProviders } from "~/hooks/native-social-auth";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

const openRecovery = () => router.push("/auth/forgot-password");

const LoginView = () => {
  const { t } = useTranslation();
  const { signIn } = useSignIn();
  const operation = useAuthOperation();
  const providers = useAvailableSocialProviders();
  const busy = operation.pending !== null;
  const handleEdit = operation.clearError;

  const finishPassword = async () => {
    const { error: finalizeError } = await signIn.finalize();

    if (finalizeError) {
      return getAuthErrorMessage(finalizeError);
    }

    if (!IS_E2E) {
      segmentClient.track("User Logged In");
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
      params: { purpose: "sign-in", source: "login" },
      pathname: "/auth/verify-code",
    });
  };

  const submitEmail = (values: LoginFormValues) =>
    operation.run("email", async (current) => {
      const { error } = await signIn.password({
        emailAddress: values.email,
        password: values.password,
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

      return t("auth.login.cantSignInHere");
    });

  const renderForm = ({ fields, action }: AuthFormParts) => (
    <AuthScreen
      action={
        <View className="gap-xs">
          {operation.error ? (
            <ErrorMessage testID="login-error">{operation.error}</ErrorMessage>
          ) : null}
          {action}
        </View>
      }
      footer={
        <>
          <AuthLegal disabled={busy} />
          <AuthSwitch
            disabled={busy}
            href="/auth/register"
            label={t("auth.login.registerLink")}
            prompt={t("auth.login.noAccount")}
          />
        </>
      }
    >
      <AuthHeader title={t("auth.login.heading")} />
      <SocialAuthButtons divider operation={operation} providers={providers} />
      <View className="gap-sm">
        {fields}
        <Pressable
          accessibilityRole="link"
          className="min-h-11 items-end justify-center"
          disabled={busy}
          onPress={openRecovery}
          testID="forgot-password-link"
        >
          <Text variant="small">{t("auth.login.forgotPasswordLink")}</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );

  return (
    <LoginForm disabled={busy} onEdit={handleEdit} onSubmit={submitEmail}>
      {renderForm}
    </LoginForm>
  );
};

export default LoginView;
