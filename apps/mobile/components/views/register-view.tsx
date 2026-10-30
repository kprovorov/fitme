import { useAuth, useSignUp } from "@clerk/expo";
import { splitName } from "@fitme/core";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { ErrorMessage } from "~/components/ui/error-message";
import type { CodePurpose } from "~/components/views/verify-code-view";
import { getClerkErrorMessage } from "~/lib/clerk";
import RegisterForm, {
  type RegisterFormValues,
} from "../forms/auth/register-form";
import { Text } from "../ui/text";
import { H3 } from "../ui/typography";
import { VStack } from "../ui/vstack";

const goToLogin = () => router.push("/auth/login");

export default function RegisterView() {
  const { t } = useTranslation();
  const { signUp } = useSignUp();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/");
    }
  }, [isSignedIn]);

  const handleSubmit = useCallback(
    async ({ email, name, password }: RegisterFormValues) => {
      setErrorMessage(undefined);
      const { firstName, lastName } = splitName(name);
      const { error } = await signUp.password({
        emailAddress: email,
        firstName,
        lastName: lastName || undefined,
        password,
      });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setErrorMessage(getClerkErrorMessage(sendError));
        return;
      }
      router.push({
        params: { purpose: "sign-up" satisfies CodePurpose },
        pathname: "/auth/verify-code",
      });
    },
    [signUp]
  );

  return (
    <VStack className="w-full gap-4">
      <VStack className="gap-0">
        <H3>{t("auth.welcome")}</H3>
        <Text className="text-muted-foreground text-subhead-emphasized">
          {t("auth.register.subtitle")}
        </Text>
      </VStack>
      {errorMessage ? <ErrorMessage>{errorMessage}</ErrorMessage> : null}
      <RegisterForm onSubmit={handleSubmit} />
      <View className="flex-row items-center">
        <Text className="text-subhead-emphasized">
          {t("auth.register.haveAccount")}{" "}
        </Text>
        <Pressable onPress={goToLogin} testID="login-here-link">
          <Text className="text-primary text-subhead-emphasized">
            {t("auth.register.loginLink")}
          </Text>
        </Pressable>
      </View>
    </VStack>
  );
}
