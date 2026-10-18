import { useSignIn } from "@clerk/expo";
import { Link, router } from "expo-router";
import { useCallback, useState } from "react";
import ForgotPasswordForm, {
  type ForgotPasswordFormValues,
} from "~/components/forms/auth/forgot-password-form";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import type { CodePurpose } from "~/components/views/verify-code-view";
import { getClerkErrorMessage } from "~/lib/clerk";

export default function ForgotPasswordView() {
  const { signIn } = useSignIn();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const handleSubmit = useCallback(
    async ({ email }: ForgotPasswordFormValues) => {
      setErrorMessage(undefined);
      const { error } = await signIn.create({ identifier: email });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      const { error: sendError } =
        await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        setErrorMessage(getClerkErrorMessage(sendError));
        return;
      }
      router.push({
        params: { purpose: "reset-password" satisfies CodePurpose },
        pathname: "/auth/verify-code",
      });
    },
    [signIn]
  );

  return (
    <VStack className="w-full gap-4">
      <VStack className="gap-0">
        <H3>Forgot password?</H3>
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Enter your email and we&apos;ll send you a code to reset it.
        </Text>
      </VStack>
      {errorMessage ? <ErrorMessage>{errorMessage}</ErrorMessage> : null}
      <ForgotPasswordForm onSubmit={handleSubmit} />
      <Text className="font-nunito-sans-bold text-subhead">
        Remember your password?{" "}
        <Link className="font-nunito-sans-bold text-primary" href="/auth/login">
          Login here
        </Link>
      </Text>
    </VStack>
  );
}
