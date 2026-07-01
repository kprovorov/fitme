import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import LoginForm from "@/components/forms/auth/login-form";
import { useLoginMutation } from "@/hooks/mutations/auth";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { handleSupabaseError } from "~/lib/utils";
import { Text } from "../ui/text";
import { H3, P } from "../ui/typography";
import { VStack } from "../ui/vstack";

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
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Log in to your account to access your workouts
        </Text>
      </VStack>
      {errorMessage && <P className="text-red-500">{errorMessage}</P>}
      <LoginForm
        onSubmit={async (values) => {
          await login(values);
        }}
      />
      <Text className="font-nunito-sans-bold text-subhead">
        <Link
          className="font-nunito-sans-bold text-primary"
          href="/auth/forgot-password"
        >
          Forgot password?
        </Link>
      </Text>
      <Text className="font-nunito-sans-bold text-subhead">
        Don&apos;t have an account?{" "}
        <Link
          className="font-nunito-sans-bold text-primary"
          href="/auth/register"
        >
          Register here
        </Link>
      </Text>
    </VStack>
  );
}
