import { useSignIn } from "@clerk/expo";
import { Link, router } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
        <H3>{t("forgotPassword.title")}</H3>
        <Text className="text-muted-foreground text-subhead-emphasized">
          {t("forgotPassword.description")}
        </Text>
      </VStack>
      {errorMessage ? <ErrorMessage>{errorMessage}</ErrorMessage> : null}
      <ForgotPasswordForm onSubmit={handleSubmit} />
      <Text className="text-subhead-emphasized">
        {t("forgotPassword.remember")}{" "}
        <Link
          className="text-primary text-subhead-emphasized"
          href="/auth/login"
        >
          {t("forgotPassword.login")}
        </Link>
      </Text>
    </VStack>
  );
}
