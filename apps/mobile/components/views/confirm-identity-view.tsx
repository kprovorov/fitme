import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { CodeInput } from "~/components/auth/code-input";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { useConfirmIdentity } from "~/hooks/confirm-identity";
import type { PendingReverification } from "~/hooks/reverification";

const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** "Forgot password?": a Footnote Emphasized link in a 44 pt row. */
const ForgotPasswordLink = ({
  disabled,
  onPress,
}: {
  readonly disabled: boolean;
  readonly onPress: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <View className="flex-row justify-end">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className="pl-xs min-h-11 justify-center"
        disabled={disabled}
        onPress={onPress}
      >
        <Text className="text-footnote-emphasized text-primary">
          {t("confirmIdentity.password.forgot")}
        </Text>
      </Pressable>
    </View>
  );
};

/** "Didn't get it?" and the resend link, held back while it counts down. */
const ResendRow = ({
  disabled,
  onPress,
  resendIn,
  sending,
}: {
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly resendIn: number;
  readonly sending: boolean;
}) => {
  const { t } = useTranslation();
  const coolingDown = resendIn > 0;

  const label = coolingDown
    ? t("verifyCode.resendIn", { time: formatCountdown(resendIn) })
    : t("confirmIdentity.code.resend");

  return (
    <View className="flex-row flex-wrap items-center justify-center gap-x-1">
      <Text className="text-footnote" variant="muted">
        {t("verifyCode.didntGet")}
      </Text>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{
          busy: sending,
          disabled: disabled || coolingDown,
        }}
        className="min-h-11 justify-center"
        disabled={disabled || coolingDown}
        onPress={onPress}
      >
        {sending ? (
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        ) : (
          <Text
            className={
              coolingDown
                ? "text-footnote text-muted-foreground"
                : "text-footnote-emphasized text-primary"
            }
          >
            {label}
          </Text>
        )}
      </Pressable>
    </View>
  );
};

/** The sheet's title and what it asks for. */
const Header = ({ description }: { readonly description: string | null }) => {
  const { t } = useTranslation();

  return (
    <View className="gap-xs">
      <Text
        accessibilityRole="header"
        className="text-headline-emphasized text-center"
      >
        {t("confirmIdentity.title")}
      </Text>
      {description ? (
        <Text className="text-center" variant="muted">
          {description}
        </Text>
      ) : null}
    </View>
  );
};

/**
 * "Confirm it's you" (Figma ConfirmItsYouSheet): Clerk's reverification,
 * answered with the User's password or, without one (or after "Forgot
 * password?"), a code emailed to their primary address. Once Clerk says the
 * session is verified, `onDone("complete")` runs the call that asked; Cancel
 * answers `onDone("cancel")` and nothing runs.
 */
export const ConfirmIdentityView = ({
  onDone,
  reverification,
}: {
  readonly onDone: (answer: "cancel" | "complete") => void;
  readonly reverification: PendingReverification;
}) => {
  const { t } = useTranslation();
  const confirm = useConfirmIdentity(reverification, onDone);
  const { email, errorKey, method, operation } = confirm;
  const busy = operation !== null;
  const verifying = operation === "verify";
  const cancel = useCallback(() => onDone("cancel"), [onDone]);
  const { verify } = confirm;

  const submit = useCallback(() => {
    void verify();
  }, [verify]);

  let description: string | null = null;

  if (method === "password") {
    description = t("confirmIdentity.password.description");
  } else if (method === "code" && email) {
    description = t("confirmIdentity.code.description", { email });
  }

  const error = errorKey ? t(`confirmIdentity.errors.${errorKey}`) : null;

  return (
    // Scrolls once the content outgrows the sheet (the largest text sizes,
    // with the keyboard up), so Continue and Cancel stay reachable.
    <ScrollView
      accessibilityViewIsModal
      automaticallyAdjustKeyboardInsets
      contentContainerClassName="gap-sm px-sm pb-md pt-lg"
      keyboardShouldPersistTaps="handled"
      onAccessibilityEscape={verifying ? undefined : cancel}
    >
      <Header description={description} />

      {operation === "start" ? (
        <ActivityIndicator
          className="min-h-12"
          colorClassName="accent-muted-foreground"
        />
      ) : null}

      {method === "password" ? (
        <Input
          accessibilityLabel={t("confirmIdentity.password.placeholder")}
          autoComplete="current-password"
          autoFocus
          editable={!busy}
          error={!!error}
          onChangeText={confirm.handlePasswordChange}
          onSubmitEditing={confirm.canContinue && !busy ? submit : undefined}
          placeholder={t("confirmIdentity.password.placeholder")}
          returnKeyType="go"
          secureTextEntry
          textContentType="password"
          value={confirm.password}
        />
      ) : null}

      {method === "code" ? (
        <CodeInput
          autoFocus
          disabled={busy}
          error={!!error}
          label={t("confirmIdentity.code.placeholder")}
          onChange={confirm.handleCodeChange}
          value={confirm.code}
        />
      ) : null}

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      {method === "password" && email ? (
        <ForgotPasswordLink disabled={busy} onPress={confirm.handleEmailCode} />
      ) : null}

      {method === "code" && email ? (
        <ResendRow
          disabled={busy}
          onPress={confirm.handleEmailCode}
          resendIn={confirm.resendIn}
          sending={operation === "send"}
        />
      ) : null}

      <View className="gap-xs">
        <Button
          accessibilityLabel={
            verifying ? t("verifyCode.loading") : t("confirmIdentity.continue")
          }
          disabled={!confirm.canContinue || busy}
          isLoading={verifying}
          label={t("confirmIdentity.continue")}
          onPress={submit}
          size="lg"
        />
        <Button
          disabled={verifying}
          label={t("common.cancel")}
          onPress={cancel}
          size="lg"
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
};
