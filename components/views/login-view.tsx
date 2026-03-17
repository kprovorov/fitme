import LoginForm from "@/components/forms/auth/login-form";
import { useLoginMutation } from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { H3, P } from "../ui/typography";
import { useEffect, useState } from "react";
import { handleSupabaseError } from "~/lib/utils";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { Text } from "../ui/text";

export default function LoginView() {
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { data: user } = useCurrentUserQuery();

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user]);

  const { mutateAsync: login } = useLoginMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      router.replace("/");
    },
    onError: (error) => {
      handleSupabaseError(error, setErrorMessage);
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
      />
      <Text className="text-sm font-nunito-sans-bold">
        <Link
          href="/auth/forgot-password"
          className="text-primary font-nunito-sans-bold"
        >
          Forgot password?
        </Link>
      </Text>
      <Text className="text-sm font-nunito-sans-bold">
        Don&apos;t have an account?{" "}
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
