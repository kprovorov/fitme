import { isClerkAPIResponseError, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { z } from "zod";

import { AuthHeader } from "~/components/auth/auth-header";
import { AuthScreen } from "~/components/auth/auth-screen";
import { getAuthErrorMessage } from "~/components/auth/error";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { useReverifiedCall } from "~/hooks/reverification";
import { dropUnusedEmailAddress } from "~/lib/email-addresses";

/** Clerk's answer for an address another account (or this one) already has. */
const EMAIL_IN_USE_CODES = new Set([
  "form_identifier_exists",
  "form_email_address_exists",
]);

const emailSchema = z.email();

/** Where a failure shows: under the field, or above Send Code. */
type Failure =
  | { readonly field: string; readonly kind: "field" }
  | { readonly kind: "form"; readonly message: string };

const isEmailInUse = (error: unknown) =>
  isClerkAPIResponseError(error) &&
  error.errors.some(({ code }) => EMAIL_IN_USE_CODES.has(code));

/** One of the User's email addresses, as far as Change Email reads it. */
interface AddedAddress {
  readonly destroy: () => Promise<unknown>;
  readonly emailAddress: string;
  readonly id: string;
  readonly prepareVerification: (params: {
    strategy: "email_code";
  }) => Promise<unknown>;
}

/** What sending the code ended in. */
type CodeRequest =
  | { readonly error: unknown; readonly status: "failed" }
  | { readonly id: string; readonly status: "sent" }
  | { readonly status: "cancelled" | "in-use" };

/**
 * Adds the address (`add`, through "Confirm it's you") and emails it a code.
 * When the code never goes out, the address doesn't stay on the account.
 */
const requestCode = async (
  add: () => Promise<
    | { readonly status: "cancelled" }
    | { readonly status: "done"; readonly value: AddedAddress | undefined }
  >
): Promise<CodeRequest> => {
  let added: AddedAddress | undefined;

  try {
    const result = await add();

    if (result.status === "cancelled") {
      return { status: "cancelled" };
    }

    added = result.value;
  } catch (error) {
    return isEmailInUse(error)
      ? { status: "in-use" }
      : { error, status: "failed" };
  }

  if (!added) {
    return {
      error: new Error("No signed-in User to change the email of"),
      status: "failed",
    };
  }

  try {
    await added.prepareVerification({ strategy: "email_code" });

    return { id: added.id, status: "sent" };
  } catch (error) {
    await added.destroy().catch(() => null);

    return { error, status: "failed" };
  }
};

/**
 * Change Email (Figma 1479:6659), from Account & Security: the new address.
 * Send Code adds it to the User's Clerk account, through "Confirm it's
 * you" when Clerk says the session is too old, emails it a code and opens
 * the shared code screen (`purpose=change-email`), which makes it primary
 * once verified. An address already taken shows "Email in use" under the
 * field; an address the User added before and never verified is used again
 * rather than added twice. Open to every User, Apple-only ones included.
 */
const ChangeEmailView = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useUser();
  const [email, setEmail] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sending, setSending] = useState(false);
  // Whether the form is still on screen: a code asked for by a form the
  // User has left opens nothing.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const addEmail = useReverifiedCall(
    async (address: string): Promise<AddedAddress | undefined> =>
      await user?.createEmailAddress({ email: address })
  );

  const changeEmail = useCallback((value: string) => {
    setEmail(value);
    setFailure(null);
  }, []);

  /** The address to send the code to: one added before, or a new one. */
  const addressFor = useCallback(
    async (address: string) => {
      const unverified = user?.emailAddresses.find(
        (item) =>
          item.emailAddress.toLowerCase() === address.toLowerCase() &&
          item.verification.status !== "verified"
      );

      if (unverified) {
        return { status: "done" as const, value: unverified };
      }

      return await addEmail(address);
    },
    [addEmail, user]
  );

  const sendCode = useCallback(async () => {
    const address = email.trim();

    if (!emailSchema.safeParse(address).success) {
      setFailure({
        field: t("changeEmail.errors.invalidEmail"),
        kind: "field",
      });

      return;
    }

    if (
      address.toLowerCase() ===
      user?.primaryEmailAddress?.emailAddress.toLowerCase()
    ) {
      setFailure({ field: t("changeEmail.errors.sameEmail"), kind: "field" });

      return;
    }

    setSending(true);
    setFailure(null);
    const outcome = await requestCode(() => addressFor(address));

    if (!mounted.current) {
      if (outcome.status === "sent") {
        await dropUnusedEmailAddress(outcome.id);
      }

      return;
    }

    setSending(false);

    if (outcome.status === "sent") {
      router.push({
        params: { emailAddressId: outcome.id, purpose: "change-email" },
        pathname: "/change-email/verify-code",
      });
    } else if (outcome.status === "in-use") {
      setFailure({ field: t("changeEmail.errors.emailInUse"), kind: "field" });
    } else if (outcome.status === "failed") {
      setFailure({ kind: "form", message: getAuthErrorMessage(outcome.error) });
    }
  }, [addressFor, email, router, t, user]);

  const submit = useCallback(() => {
    void sendCode();
  }, [sendCode]);

  return (
    <AuthScreen
      action={
        <View className="gap-xs">
          {failure?.kind === "form" ? (
            <ErrorMessage testID="change-email-error">
              {failure.message}
            </ErrorMessage>
          ) : null}
          <Button
            accessibilityLabel={t(
              sending ? "changeEmail.sending" : "changeEmail.submit"
            )}
            disabled={sending || email.trim() === ""}
            isLoading={sending}
            label={t("changeEmail.submit")}
            onPress={submit}
            size="lg"
            testID="change-email-button"
          />
        </View>
      }
      spacing="lg"
    >
      <AuthHeader
        description={t("changeEmail.description", {
          email: user?.primaryEmailAddress?.emailAddress ?? "",
        })}
        mark={false}
        title={t("changeEmail.heading")}
      />
      <Input
        accessibilityLabel={t("changeEmail.new")}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!sending}
        error={failure?.kind === "field" ? failure.field : undefined}
        keyboardType="email-address"
        onChangeText={changeEmail}
        onSubmitEditing={submit}
        placeholder={t("changeEmail.new")}
        returnKeyType="send"
        spellCheck={false}
        testID="change-email-input"
        textContentType="emailAddress"
        value={email}
      />
    </AuthScreen>
  );
};

export default ChangeEmailView;
