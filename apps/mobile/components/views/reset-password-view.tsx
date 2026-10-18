import { useAuth, useSignIn } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import ResetPasswordForm, {
  type ResetPasswordFormValues,
} from "~/components/forms/auth/reset-password-form";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import type { CodePurpose } from "~/components/views/verify-code-view";
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

  // Device Trust: on a new device the password alone doesn't sign the User in,
  // so the shared code screen finishes the sign-in with an emailed code.
  const confirmDevice = useCallback(async () => {
    const canUseEmailCode = signIn.supportedSecondFactors.some(
      (factor) => factor.strategy === "email_code"
    );
    if (
      !(
        (signIn.status === "needs_client_trust" ||
          signIn.status === "needs_second_factor") &&
        canUseEmailCode
      )
    ) {
      setErrorMessage(
        "Your password was changed. Log in with your new password."
      );
      return;
    }
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) {
      setErrorMessage(getClerkErrorMessage(error));
      return;
    }
    router.push({
      params: { purpose: "sign-in" satisfies CodePurpose },
      pathname: "/auth/verify-code",
    });
  }, [signIn]);

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
        await confirmDevice();
        return;
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        setErrorMessage(getClerkErrorMessage(finalizeError));
      }
      // The isSignedIn effect takes the User Home.
    },
    [confirmDevice, signIn]
  );

  return (
    <VStack className="w-full gap-4">
      <VStack className="gap-0">
        <H3>Set new password</H3>
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Choose a new password for your account.
        </Text>
      </VStack>
      {errorMessage ? <ErrorMessage>{errorMessage}</ErrorMessage> : null}
      <ResetPasswordForm onSubmit={handleSubmit} />
    </VStack>
  );
}
