import { useLoginMutation, useRegisterMutation } from "@/hooks/mutations/auth";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import RegisterForm, { RegisterFormValues } from "../forms/auth/register-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FieldErrors } from "react-hook-form";
import { handleAxiosError } from "~/lib/utils";

export default function RegisterView() {
  const queryClient = useQueryClient();

  const [errors, setErrors] = useState<
    FieldErrors<RegisterFormValues> | undefined
  >();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { mutateAsync: login } = useLoginMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      router.replace("/");
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
