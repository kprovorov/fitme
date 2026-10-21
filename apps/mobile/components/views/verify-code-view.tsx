import { useAuth, useSignIn, useSignUp } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ErrorMessage } from "~/components/ui/error-message";
import { getClerkErrorMessage } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";
import { H3, P } from "../ui/typography";
import { VStack } from "../ui/vstack";

/** What the emailed code proves; each purpose drives its own Clerk flow. */
export const codePurposes = ["sign-up", "reset-password", "sign-in"] as const;
export type CodePurpose = (typeof codePurposes)[number];

export const isCodePurpose = (value: unknown): value is CodePurpose =>
  codePurposes.some((purpose) => purpose === value);

/** The Clerk flow behind one purpose; both return an error message or none. */
interface CodeVerification {
  isFetching: boolean;
  resend: () => Promise<string | undefined>;
  verify: (code: string) => Promise<string | undefined>;
}

const useSignUpVerification = (): CodeVerification => {
  const { signUp, fetchStatus } = useSignUp();

  const resend = useCallback(async () => {
    const { error } = await signUp.verifications.sendEmailCode();
    return error ? getClerkErrorMessage(error) : undefined;
  }, [signUp]);

  const verify = useCallback(
    async (code: string) => {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) {
        return getClerkErrorMessage(error);
      }
      if (signUp.status !== "complete") {
        return "We couldn't finish creating your account. Please try again.";
      }
      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) {
        return getClerkErrorMessage(finalizeError);
      }
      if (!IS_E2E) {
        segmentClient.track("User Registered");
      }
    },
    [signUp]
  );

  return { isFetching: fetchStatus === "fetching", resend, verify };
};

const useResetPasswordVerification = (): CodeVerification => {
  const { signIn, fetchStatus } = useSignIn();

  const resend = useCallback(async () => {
    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    return error ? getClerkErrorMessage(error) : undefined;
  }, [signIn]);

  const verify = useCallback(
    async (code: string) => {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({
        code,
      });
      if (error) {
        return getClerkErrorMessage(error);
      }
      if (signIn.status !== "needs_new_password") {
        return "We couldn't verify the code. Please try again.";
      }
      router.replace("/auth/reset-password");
    },
    [signIn]
  );

  return { isFetching: fetchStatus === "fetching", resend, verify };
};

/** Device Trust: a sign-in on a new device also needs an emailed code. */
const useSignInVerification = (): CodeVerification => {
  const { signIn, fetchStatus } = useSignIn();

  const resend = useCallback(async () => {
    const { error } = await signIn.mfa.sendEmailCode();
    return error ? getClerkErrorMessage(error) : undefined;
  }, [signIn]);

  const verify = useCallback(
    async (code: string) => {
      const { error } = await signIn.mfa.verifyEmailCode({ code });
      if (error) {
        return getClerkErrorMessage(error);
      }
      if (signIn.status !== "complete") {
        return "We couldn't sign you in. Please try again.";
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        return getClerkErrorMessage(finalizeError);
      }
    },
    [signIn]
  );

  return { isFetching: fetchStatus === "fetching", resend, verify };
};

const COPY: Record<CodePurpose, { description: string; title: string }> = {
  "reset-password": {
    description: "Enter the code we emailed you to reset your password",
    title: "Check your email",
  },
  "sign-in": {
    description:
      "Enter the code we sent you to confirm it's you on this device",
    title: "Check your email",
  },
  "sign-up": {
    description: "Enter the code we emailed you to activate your account",
    title: "Check your email",
  },
};

interface VerifyCodeViewProps {
  /** Picks the Clerk flow the code completes. */
  purpose: CodePurpose;
}

export default function VerifyCodeView({ purpose }: VerifyCodeViewProps) {
  // Every flow's hook runs on every render, called by name: the React
  // Compiler memoizes a hook picked at runtime (`hooks[purpose]()`) as a plain
  // call, skipping Clerk's hooks on re-renders and breaking the hook order.
  const verifications: Record<CodePurpose, CodeVerification> = {
    "reset-password": useResetPasswordVerification(),
    "sign-in": useSignInVerification(),
    "sign-up": useSignUpVerification(),
  };
  const { isFetching, resend, verify } = verifications[purpose];
  const { description, title } = COPY[purpose];

  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const { isSignedIn } = useAuth();
  useEffect(() => {
    if (isSignedIn) {
      router.replace("/");
    }
  }, [isSignedIn]);

  const handleVerify = useCallback(async () => {
    setErrorMessage(undefined);
    setNotice(undefined);
    // Sign-up and sign-in end signed in, and the isSignedIn effect takes the
    // User on; a reset moves on to the new-password screen itself.
    setErrorMessage(await verify(code));
  }, [code, verify]);

  const handleResend = useCallback(async () => {
    setErrorMessage(undefined);
    setNotice(undefined);
    const error = await resend();
    if (error) {
      setErrorMessage(error);
      return;
    }
    setNotice("We sent you a new code.");
  }, [resend]);

  return (
    <VStack className="w-full">
      <VStack className="gap-0">
        <H3>{title}</H3>
        <Text className="text-muted-foreground text-subhead-emphasized">
          {description}
        </Text>
      </VStack>
      {errorMessage ? (
        <ErrorMessage testID="verify-code-error">{errorMessage}</ErrorMessage>
      ) : null}
      {notice ? <P className="text-muted-foreground">{notice}</P> : null}
      <VStack className="w-full items-stretch gap-4">
        <Input
          autoComplete="one-time-code"
          editable={!isFetching}
          keyboardType="number-pad"
          onChangeText={setCode}
          placeholder="Code"
          testID="verify-code-input"
          textContentType="oneTimeCode"
          value={code}
        />
        <Button
          disabled={!code}
          icon="arrow.right"
          iconPosition="trailing"
          isLoading={isFetching}
          label="Verify"
          onPress={handleVerify}
          testID="verify-code-button"
        />
        <Button
          disabled={isFetching}
          label="Send a new code"
          onPress={handleResend}
          testID="verify-code-resend-button"
          variant="ghost"
        />
      </VStack>
    </VStack>
  );
}
