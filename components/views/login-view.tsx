import LoginForm, { LoginFormValues } from "@/components/forms/auth/login-form";
import { useLoginMutation } from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { H3, P } from "../ui/typography";
import { useEffect, useState } from "react";
import { FieldErrors } from "react-hook-form";
import { handleAxiosError } from "~/lib/utils";
import Purchases from "react-native-purchases";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import * as Sentry from "@sentry/react-native";
import { Text } from "../ui/text";

export default function LoginView() {
  const queryClient = useQueryClient();

  const [errors, setErrors] = useState<
    FieldErrors<LoginFormValues> | undefined
  >();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { data: user } = useCurrentUserQuery();

  useEffect(() => {
    if (user) {
      Sentry.setUser({
        id: user.id,
        username: user.email,
        email: user.email,
      });
      Purchases.logIn(user.rc_user_id).then(() => {
        router.replace("/");
      });
    }
  }, [user]);

  const { mutateAsync: login } = useLoginMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: (error) => {
      handleAxiosError(error, setErrorMessage, setErrors);
    },
  });

  return (
    <VStack className="w-full">
      <VStack className="gap-0">
        <H3>Welcome to Fitme!</H3>
        <Text className="text-md font-nunito-sans-bold text-muted-foreground">
          Log in to your account to access your workouts
        </Text>
      </VStack>
      {errorMessage && <P className="text-red-500">{errorMessage}</P>}
      <LoginForm
        onSubmit={async (values) => {
          await login(values);
        }}
        errors={errors}
      />
      <Text className="text-sm font-nunito-sans-bold">
        Don't have an account?{" "}
        <Link
          href="/auth/register"
          className="text-primary font-nunito-sans-bold"
        >
          Register here
        </Link>
      </Text>
    </VStack>
  );
}
