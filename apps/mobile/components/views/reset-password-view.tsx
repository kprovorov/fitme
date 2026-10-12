import { useAuth, useSignIn } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import ResetPasswordForm, {
  type ResetPasswordFormValues,
} from "~/components/forms/auth/reset-password-form";
import { Text } from "~/components/ui/text";
import { H3, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { getClerkErrorMessage } from "~/lib/clerk";

/** Sets a new password once the emailed reset code checked out. */
export default function ResetPasswordView() {
  const { signIn } = useSignIn();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { isSignedIn } = useAuth();
  useEffect(() => {
    if (isSignedIn) {
      router.replace("/");
    }
  }, [isSignedIn]);

  const handleSubmit = useCallback(
    async ({ password }: ResetPasswordFormValues) => {
      setErrorMessage(undefined);
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
      });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }
      if (signIn.status !== "complete") {
        setErrorMessage("This account can't sign in here yet.");
        return;
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        setErrorMessage(getClerkErrorMessage(finalizeError));
      }
      // The isSignedIn effect takes the User Home.
    },
    [signIn]
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
