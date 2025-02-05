import LoginForm, { LoginFormValues } from "@/components/forms/auth/login-form";
import { useLoginMutation } from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import { useEffect, useState } from "react";
import { FieldErrors } from "react-hook-form";
import { handleAxiosError } from "~/lib/utils";
import Purchases from "react-native-purchases";
import { useCurrentUserQuery } from "~/hooks/queries/auth";

export default function LoginView() {
  const queryClient = useQueryClient();

  const [errors, setErrors] = useState<
    FieldErrors<LoginFormValues> | undefined
  >();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { data: user } = useCurrentUserQuery();

  useEffect(() => {
    if (user) {
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
      {errorMessage && <P className="text-red-500">{errorMessage}</P>}
      <LoginForm
        onSubmit={async (values) => {
          await login(values);
        }}
        errors={errors}
      />
      <P>
        Don't have an account?{" "}
        <Link href="/auth/register" className="text-primary font-semibold">
          Register here
        </Link>
      </P>
    </VStack>
  );
}
