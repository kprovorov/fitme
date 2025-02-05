import { useLoginMutation, useRegisterMutation } from "@/hooks/mutations/auth";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import RegisterForm, { RegisterFormValues } from "../forms/auth/register-form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FieldErrors } from "react-hook-form";
import { handleAxiosError } from "~/lib/utils";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import Purchases from "react-native-purchases";

export default function RegisterView() {
  const queryClient = useQueryClient();

  const [errors, setErrors] = useState<
    FieldErrors<RegisterFormValues> | undefined
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

  const { mutateAsync: register } = useRegisterMutation({
    onSuccess: async (data, variables, context) => {
      await login({
        email: variables.email,
        password: variables.password,
      });
    },
    onError: (error) => {
      handleAxiosError(error, setErrorMessage, setErrors);
    },
  });

  return (
    <VStack className="w-full">
      {errorMessage && <P className="text-red-500">{errorMessage}</P>}
      <RegisterForm
        onSubmit={async (values) => {
          await register(values);
        }}
        errors={errors}
      />
      <P>
        Already have an account?{" "}
        <Link href="/auth/login" className="text-primary font-semibold">
          Login here
        </Link>
      </P>
    </VStack>
  );
}
