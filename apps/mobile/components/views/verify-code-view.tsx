import { useAuth, useSignUp } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { getClerkErrorMessage } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";
import { H3, P } from "../ui/typography";
import { VStack } from "../ui/vstack";

/** What the emailed code proves; each purpose drives its own Clerk flow. */
export const codePurposes = ["sign-up"] as const;
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

const VERIFICATIONS: Record<CodePurpose, () => CodeVerification> = {
  "sign-up": useSignUpVerification,
};

const COPY: Record<CodePurpose, { description: string; title: string }> = {
  "sign-up": {
    description: "Enter the code we emailed you to activate your account",
    title: "Check your email",
  },
};

interface VerifyCodeViewProps {
  /** Picks the Clerk hook, so render with `key={purpose}` to keep hook order. */
  purpose: CodePurpose;
}

export default function VerifyCodeView({ purpose }: VerifyCodeViewProps) {
  const { isFetching, resend, verify } = VERIFICATIONS[purpose]();
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
    // Once signed in, the isSignedIn effect takes the User on to onboarding.
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
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          {description}
        </Text>
      </VStack>
      {errorMessage ? (
        <P className="text-red-500" testID="verify-code-error">
          {errorMessage}
        </P>
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
          isLoading={isFetching}
          label="Verify"
          onPress={handleVerify}
          systemImage="arrow.right"
          testID="verify-code-button"
        />
        <Button
          disabled={isFetching}
          label="Send a new code"
          onPress={handleResend}
          testID="verify-code-resend-button"
          variant="link"
        />
      </VStack>
    </VStack>
  );
}
