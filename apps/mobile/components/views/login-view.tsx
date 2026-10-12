import { useAuth, useSignIn } from "@clerk/expo";
import { Link, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import LoginForm, {
  type LoginFormValues,
} from "@/components/forms/auth/login-form";
import { getClerkErrorMessage } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";
import { H3, P } from "../ui/typography";
import { VStack } from "../ui/vstack";

export default function LoginView() {
  const { signIn, fetchStatus } = useSignIn();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [code, setCode] = useState("");

  // Device Trust: a password sign-in from a new device also needs a code
  // emailed to the User.
  const [isAwaitingCode, setIsAwaitingCode] = useState(false);

  const isFetching = fetchStatus === "fetching";

  const { isSignedIn } = useAuth();
  useEffect(() => {
    if (isSignedIn) {
      router.replace("/");
    }
  }, [isSignedIn]);

  const finish = useCallback(async () => {
    const { error } = await signIn.finalize();
    if (error) {
      setErrorMessage(getClerkErrorMessage(error));
      return;
    }
    if (!IS_E2E) {
      segmentClient.track("User Logged In");
    }
    // The isSignedIn effect takes the User Home.
  }, [signIn]);

  const handleSubmit = useCallback(
    async ({ email, password }: LoginFormValues) => {
      setErrorMessage(undefined);
      const { error } = await signIn.password({
        emailAddress: email,
        password,
      });
      if (error) {
        setErrorMessage(getClerkErrorMessage(error));
        return;
      }

      if (signIn.status === "complete") {
        await finish();
        return;
      }

      const canUseEmailCode = signIn.supportedSecondFactors.some(
        (factor) => factor.strategy === "email_code"
      );
      if (
        (signIn.status === "needs_client_trust" ||
          signIn.status === "needs_second_factor") &&
        canUseEmailCode
      ) {
        const { error: sendError } = await signIn.mfa.sendEmailCode();
        if (sendError) {
          setErrorMessage(getClerkErrorMessage(sendError));
          return;
        }
        setIsAwaitingCode(true);
        return;
      }

      setErrorMessage("This account can't sign in here yet.");
    },
    [finish, signIn]
  );

  const handleVerifyCode = useCallback(async () => {
    setErrorMessage(undefined);
    const { error } = await signIn.mfa.verifyEmailCode({ code });
    if (error) {
      setErrorMessage(getClerkErrorMessage(error));
      return;
    }
    if (signIn.status === "complete") {
      await finish();
    }
  }, [code, finish, signIn]);

  const handleResendCode = useCallback(async () => {
    setErrorMessage(undefined);
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) {
      setErrorMessage(getClerkErrorMessage(error));
    }
  }, [signIn]);

  const handleStartOver = useCallback(async () => {
    setErrorMessage(undefined);
    setCode("");
    setIsAwaitingCode(false);
    await signIn.reset();
  }, [signIn]);

  if (isAwaitingCode) {
    return (
      <VStack className="w-full">
        <VStack className="gap-0">
          <H3>Check your email</H3>
          <Text className="font-nunito-sans-bold text-md text-muted-foreground">
            Enter the code we sent you to confirm it&apos;s you on this device
          </Text>
        </VStack>
        {errorMessage ? <P className="text-red-500">{errorMessage}</P> : null}
        <VStack className="w-full items-stretch gap-4">
          <Input
            autoComplete="one-time-code"
            editable={!isFetching}
            keyboardType="number-pad"
            onChangeText={setCode}
            placeholder="Code"
            testID="login-code-input"
            textContentType="oneTimeCode"
            value={code}
          />
          <Button
            disabled={!code}
            isLoading={isFetching}
            label="Verify"
            onPress={handleVerifyCode}
            systemImage="arrow.right"
            testID="login-code-button"
          />
          <Button
            disabled={isFetching}
            label="Send a new code"
            onPress={handleResendCode}
            variant="link"
          />
          <Button
            disabled={isFetching}
            label="Use a different account"
            onPress={handleStartOver}
            variant="link"
          />
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack className="w-full">
      <VStack className="gap-0">
        <H3>Welcome to Fitme!</H3>
        <Text className="font-nunito-sans-bold text-md text-muted-foreground">
          Log in to your account to access your workouts
        </Text>
      </VStack>
      {errorMessage ? <P className="text-red-500">{errorMessage}</P> : null}
      <LoginForm onSubmit={handleSubmit} />
      <Text className="font-nunito-sans-bold text-subhead">
        <Link
          className="font-nunito-sans-bold text-primary"
          href="/auth/forgot-password"
          testID="forgot-password-link"
        >
          Forgot password?
        </Link>
      </Text>
      <Text className="font-nunito-sans-bold text-subhead">
        Don&apos;t have an account?{" "}
        <Link
          className="font-nunito-sans-bold text-primary"
          href="/auth/register"
        >
          Register here
        </Link>
      </Text>
    </VStack>
  );
}
