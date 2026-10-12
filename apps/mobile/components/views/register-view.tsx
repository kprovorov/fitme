import { useAuth } from "@clerk/expo";
import { handleSupabaseError } from "@fitme/core";
import { useLocales } from "expo-localization";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRegisterMutation } from "@/hooks/mutations/auth";
import RegisterForm, {
  type RegisterFormValues,
} from "../forms/auth/register-form";
import { Text } from "../ui/text";
import { H3, P } from "../ui/typography";
import { VStack } from "../ui/vstack";

const goToLogin = () => router.push("/auth/login");

export default function RegisterView() {
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/");
    }
  }, [isSignedIn]);

  const { mutateAsync: register } = useRegisterMutation({
    onError: (error) => {
      handleSupabaseError(error, setErrorMessage);
    },
  });

  const locales = useLocales();

  const handleSubmit = useCallback(
    async (values: RegisterFormValues) => {
      await register({
        ...values,
        measurement_system: locales[0].measurementSystem ?? "metric",
      });
    },
    [locales, register]
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
