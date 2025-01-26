import LoginForm, { LoginFormValues } from "@/components/forms/auth/login-form";
import {
  LoginData,
  ServerError,
  useLoginMutation,
} from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import { useState } from "react";
import { AxiosError, HttpStatusCode } from "axios";
import { FieldErrors } from "react-hook-form";
import { mapErrors } from "~/lib/utils";

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
    onError: (error) => {
      if (error.status === HttpStatusCode.UnprocessableEntity) {
        setErrors(mapErrors(error.response?.data.errors ?? {}));
      } else {
        setErrorMessage(error.response?.data.message ?? "Something went wrong");
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
