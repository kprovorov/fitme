import { useAuth, useSignUp } from "@clerk/expo";
import { splitName } from "@fitme/core";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { CodePurpose } from "~/components/views/verify-code-view";
import { getClerkErrorMessage } from "~/lib/clerk";
import RegisterForm, {
  type RegisterFormValues,
} from "../forms/auth/register-form";
import { Text } from "../ui/text";
import { H3, P } from "../ui/typography";
import { VStack } from "../ui/vstack";

const goToLogin = () => router.push("/auth/login");

export default function RegisterView() {
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
        <H3>Welcome to Fitme!</H3>
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Create an account to get started
        </Text>
      </VStack>
      {errorMessage ? <P className="text-red-500">{errorMessage}</P> : null}
      <RegisterForm onSubmit={handleSubmit} />
      <View className="flex-row items-center">
        <Text className="font-nunito-sans-bold text-subhead">
          Already have an account?{" "}
        </Text>
        <Pressable onPress={goToLogin} testID="login-here-link">
          <Text className="font-nunito-sans-bold text-primary text-subhead">
            Login here
          </Text>
        </Pressable>
      </View>
    </VStack>
  );
}
