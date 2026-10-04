import { handleSupabaseError } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { useLocales } from "expo-localization";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRegisterMutation } from "@/hooks/mutations/auth";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import RegisterForm from "../forms/auth/register-form";
import { Text } from "../ui/text";
import { H3, P } from "../ui/typography";
import { VStack } from "../ui/vstack";

export default function RegisterView() {
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { data: user } = useCurrentUserQuery();

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user]);

  const { mutateAsync: register } = useRegisterMutation({
    onError: (error) => {
      handleSupabaseError(error, setErrorMessage);
    },
    onSuccess: async () => {
      // Supabase signUp with confirmations disabled creates a session automatically
      await queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const locales = useLocales();

  return (
    <VStack className="w-full gap-4">
      <VStack className="gap-0">
        <H3>Welcome to Fitme!</H3>
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Create an account to get started
        </Text>
      </VStack>
      {errorMessage ? <P className="text-red-500">{errorMessage}</P> : null}
      <RegisterForm
        onSubmit={async (values) => {
          await register({
            ...values,
            measurement_system: locales[0].measurementSystem ?? "metric",
          });
        }}
      />
      <View className="flex-row items-center">
        <Text className="font-nunito-sans-bold text-subhead">
          Already have an account?{" "}
        </Text>
        <Pressable
          onPress={() => router.push("/auth/login")}
          testID="login-here-link"
        >
          <Text className="font-nunito-sans-bold text-primary text-subhead">
            Login here
          </Text>
        </Pressable>
      </View>
    </VStack>
  );
}
