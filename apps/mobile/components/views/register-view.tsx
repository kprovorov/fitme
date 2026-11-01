import { useSignUp } from "@clerk/expo";
import { splitName } from "@fitme/core";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { AuthHeader } from "~/components/auth/auth-header";
import { AuthLegal, AuthSwitch } from "~/components/auth/auth-links";
import { type AuthFormParts, AuthScreen } from "~/components/auth/auth-screen";
import { getAuthErrorMessage } from "~/components/auth/error";
import { useAuthOperation } from "~/components/auth/operation";
import { SocialAuthButtons } from "~/components/auth/social-auth-buttons";
import RegisterForm, {
  type RegisterFormValues,
} from "~/components/forms/auth/register-form";
import { ErrorMessage } from "~/components/ui/error-message";
import { useAvailableSocialProviders } from "~/hooks/native-social-auth";
export default function RegisterView() {
  const submitEmail = (values: RegisterFormValues) =>
    operation.run("email", async (current) => {
      const { firstName, lastName } = splitName(values.name);
      const { error } = await signUp.password({
        emailAddress: values.email,
        firstName,
        lastName: lastName || undefined,
        password: values.password,
      });
      if (!current()) {
        return;
      }
      if (error) {
        return getAuthErrorMessage(error);
      }
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (!current()) {
        return;
      }
      if (sendError) {
        return getAuthErrorMessage(sendError);
      }
      router.push({
        params: { purpose: "sign-up" },
        pathname: "/auth/verify-code",
      });
    });
  const renderForm = ({ fields, action }: AuthFormParts) => (
    <AuthScreen
      action={
        <View className="gap-xs">
          {operation.error ? (
            <ErrorMessage>{operation.error}</ErrorMessage>
          ) : null}
          {action}
        </View>
      }
      bottomAction={false}
      footer={
        <>
          <AuthLegal disabled={busy} />
          <AuthSwitch
            disabled={busy}
            href="/auth/login"
            label={t("auth.register.loginLink")}
            prompt={t("auth.register.haveAccount")}
            testID="login-here-link"
          />
        </>
      }
    >
      <AuthHeader title={t("auth.register.heading")} />
      <SocialAuthButtons divider operation={operation} providers={providers} />
      {fields}
      <View nativeID="clerk-captcha" />
    </AuthScreen>
  );
  const { t } = useTranslation();
  const { signUp } = useSignUp();
  const operation = useAuthOperation();
  const providers = useAvailableSocialProviders();
  const busy = operation.pending !== null;
  return (
    <RegisterForm
      disabled={busy}
      onEdit={operation.clearError}
      onSubmit={submitEmail}
    >
      {renderForm}
    </RegisterForm>
  );
}
