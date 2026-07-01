import { Link } from "expo-router";
import { useState } from "react";
import ForgotPasswordForm from "~/components/forms/auth/forgot-password-form";
import { Text } from "~/components/ui/text";
import { H3, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useForgotPasswordMutation } from "~/hooks/mutations/auth";
import { handleSupabaseError } from "~/lib/utils";

export default function ForgotPasswordView() {
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  const { mutateAsync: forgotPassword } = useForgotPasswordMutation({
    onError: (error) => {
      handleSupabaseError(error, setErrorMessage);
    },
  });

  if (sent) {
    return (
      <VStack className="w-full gap-4">
        <VStack className="gap-0">
          <H3>Check your email</H3>
          <Text className="font-nunito-sans-bold text-md text-muted-foreground">
            We sent a password reset link to your email address.
          </Text>
        </VStack>
        <Text className="font-nunito-sans-bold text-subhead">
          Remember your password?{" "}
          <Link
            className="font-nunito-sans-bold text-primary"
            href="/auth/login"
          >
            Login here
          </Link>
        </Text>
      </VStack>
    );
  }

  return (
    <VStack className="w-full gap-4">
      <VStack className="gap-0">
        <H3>Forgot password?</H3>
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </Text>
      </VStack>
      {errorMessage && <P className="text-red-500">{errorMessage}</P>}
      <ForgotPasswordForm
        onSubmit={async (values) => {
          await forgotPassword(values);
          setSent(true);
        }}
      />
      <Text className="font-nunito-sans-bold text-subhead">
        Remember your password?{" "}
        <Link className="font-nunito-sans-bold text-primary" href="/auth/login">
          Login here
        </Link>
      </Text>
    </VStack>
  );
}
