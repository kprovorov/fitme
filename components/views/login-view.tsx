import LoginForm, { LoginFormValues } from "@/components/forms/auth/login-form";
import { LoginError, useLoginMutation } from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import { useState } from "react";
import { AxiosError } from "axios";
import { FieldErrors } from "react-hook-form";

export default function LoginView() {
  const queryClient = useQueryClient();

  const [errors, setErrors] = useState<
    FieldErrors<LoginFormValues> | undefined
  >();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { mutateAsync: login } = useLoginMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      router.replace("/");
    },
    onError: (error: AxiosError<LoginError>) => {
      if (error.status === 422) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.response?.data.errors ?? {}).map(
              ([key, value]) => [
                key,
                {
                  type: "validate",
                  message: value[0],
                },
              ]
            )
          )
        );
      } else {
        setErrorMessage(error.response?.data.message);
      }
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
