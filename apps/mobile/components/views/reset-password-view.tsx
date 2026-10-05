import { handleSupabaseError } from "@fitme/core";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import ResetPasswordForm, {
  type ResetPasswordFormValues,
} from "~/components/forms/auth/reset-password-form";
import { Text } from "~/components/ui/text";
import { H3, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useResetPasswordMutation } from "~/hooks/mutations/auth";

export default function ResetPasswordView() {
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { mutateAsync: resetPassword } = useResetPasswordMutation({
    onError: (error) => {
      handleSupabaseError(error, setErrorMessage);
    },
  });

  const handleSubmit = useCallback(
    async (values: ResetPasswordFormValues) => {
      await resetPassword({ password: values.password });
      router.replace("/");
    },
    [resetPassword]
  );

  return (
    <VStack className="w-full gap-4">
      <VStack className="gap-0">
        <H3>Set new password</H3>
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Choose a new password for your account.
        </Text>
      </VStack>
      {errorMessage ? <P className="text-red-500">{errorMessage}</P> : null}
      <ResetPasswordForm onSubmit={handleSubmit} />
    </VStack>
  );
}
