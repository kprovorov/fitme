import { useRegisterMutation } from "@/hooks/mutations/auth";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import RegisterForm, { RegisterFormValues } from "../forms/auth/register-form";
import { HttpStatusCode } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FieldErrors } from "react-hook-form";
import { mapErrors } from "~/lib/utils";

export default function RegisterView() {
  const queryClient = useQueryClient();

  const [errors, setErrors] = useState<
    FieldErrors<RegisterFormValues> | undefined
  >();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { mutateAsync: register } = useRegisterMutation({
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
