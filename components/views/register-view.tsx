import { useRegisterMutation } from "@/hooks/mutations/auth";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { VStack } from "../ui/vstack";
import { H3, P } from "../ui/typography";
import RegisterForm, { RegisterFormValues } from "../forms/auth/register-form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { handleSupabaseError } from "~/lib/utils";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { Text } from "../ui/text";
import { useLocales } from "expo-localization";

export default function RegisterView() {
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { data: user } = useCurrentUserQuery();

  useEffect(() => {
    if (user) {
      router.replace("/onboarding");
    }
  }, [user]);

  const { mutateAsync: register } = useRegisterMutation({
    onSuccess: async () => {
      // Supabase signUp with confirmations disabled creates a session automatically
      await queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: (error) => {
      handleSupabaseError(error, setErrorMessage);
    },
  });

  const locales = useLocales();

  return (
    <VStack className="w-full gap-4">
      <VStack className="gap-0">
        <H3>Welcome to Fitme!</H3>
        <Text className="text-md font-nunito-sans-bold text-muted-foreground">
          Create an account to get started
        </Text>
      </VStack>
      {errorMessage && <P className="text-red-500">{errorMessage}</P>}
      <RegisterForm
        onSubmit={async (values) => {
          await register({
            ...values,
            measurement_system: locales[0].measurementSystem ?? "metric",
          });
        }}
      />
      <View className="flex-row items-center">
        <Text className="text-sm font-nunito-sans-bold">
          Already have an account?{" "}
        </Text>
        <Pressable
          testID="login-here-link"
          onPress={() => router.push("/auth/login")}
        >
          <Text className="text-sm text-primary font-nunito-sans-bold">
            Login here
          </Text>
        </Pressable>
      </View>
    </VStack>
  );
}
