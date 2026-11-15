import { isClerkAPIResponseError, useUser } from "@clerk/expo";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ComponentRef } from "react";
import { useController, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { TextInput } from "react-native";
import { View } from "react-native";
import { z } from "zod";

import { AuthScreen } from "~/components/auth/auth-screen";
import { getAuthErrorMessage } from "~/components/auth/error";
import { PasswordInput } from "~/components/auth/password-input";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useReverifiedCall } from "~/hooks/reverification";
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";
import { showToast } from "~/lib/toast";

const createSchema = (t: TFunction) =>
  z
    .object({
      confirmPassword: z.string(),
      currentPassword: z.string(),
      newPassword: z.string().min(PASSWORD_MIN_LENGTH, {
        error: t("changePassword.errors.tooShort", {
          min: PASSWORD_MIN_LENGTH,
        }),
      }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      error: t("changePassword.errors.mismatch"),
      path: ["confirmPassword"],
    });

type ChangePasswordValues = z.infer<ReturnType<typeof createSchema>>;

/** Clerk's answer to a current password that isn't the User's. */
const isWrongCurrentPassword = (error: unknown) =>
  isClerkAPIResponseError(error) &&
  error.errors.some((item) => item.code === "form_password_incorrect");

/**
 * Change Password (Figma 1480:4898), from Account & Security: the current
 * password, the new one and the new one again. Saving runs Clerk's
 * `updatePassword` through "Confirm it's you" when Clerk asks for it, and
 * signs every other session out while this one stays. A wrong current
 * password shows on its field; any other Clerk error above the button, in
 * Clerk's own words, as the auth screens show them.
 */
const ChangePasswordView = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const schema = useMemo(() => createSchema(t), [t]);
  const [formError, setFormError] = useState<string | null>(null);

  const { control, formState, handleSubmit, setError } =
    useForm<ChangePasswordValues>({
      defaultValues: {
        confirmPassword: "",
        currentPassword: "",
        newPassword: "",
      },
      resolver: zodResolver(schema),
    });

  const currentPasswordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const newPasswordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmPasswordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const updatePassword = useReverifiedCall(
    async (currentPassword: string, newPassword: string) =>
      await user?.updatePassword({
        currentPassword,
        newPassword,
        signOutOfOtherSessions: true,
      })
  );

  const save = useCallback(
    async ({ currentPassword, newPassword }: ChangePasswordValues) => {
      setFormError(null);

      try {
        const result = await updatePassword(currentPassword, newPassword);

        // Cancelled "Confirm it's you": nothing changed, the form stays.
        if (result.status === "done") {
          showToast(t("changePassword.success"));
          router.back();
        }
      } catch (error) {
        if (isWrongCurrentPassword(error)) {
          setError("currentPassword", {
            message: t("changePassword.errors.wrongCurrent"),
          });
          currentPasswordRef.current?.focus();

          return;
        }

        setFormError(getAuthErrorMessage(error));
      }
    },
    [setError, t, updatePassword]
  );

  const submit = useCallback(() => handleSubmit(save)(), [handleSubmit, save]);

  const clearFormError = useCallback(() => setFormError(null), []);

  const { field: currentPassword, fieldState: currentPasswordState } =
    useController({ control, name: "currentPassword" });

  const { field: newPassword, fieldState: newPasswordState } = useController({
    control,
    name: "newPassword",
  });

  const { field: confirmPassword, fieldState: confirmPasswordState } =
    useController({ control, name: "confirmPassword" });

  const focusNewPassword = useCallback(
    () => newPasswordRef.current?.focus(),
    []
  );

  const focusConfirmPassword = useCallback(
    () => confirmPasswordRef.current?.focus(),
    []
  );

  const { onBlur: handleCurrentPasswordBlur } = currentPassword;
  const { onBlur: handleNewPasswordBlur } = newPassword;
  const { onBlur: handleConfirmPasswordBlur } = confirmPassword;

  // Typing again clears what the last save said about the form.
  const handleCurrentPasswordChange = useCallback(
    (value: string) => {
      currentPassword.onChange(value);
      clearFormError();
    },
    [clearFormError, currentPassword]
  );

  const handleNewPasswordChange = useCallback(
    (value: string) => {
      newPassword.onChange(value);
      clearFormError();
    },
    [clearFormError, newPassword]
  );

  const handleConfirmPasswordChange = useCallback(
    (value: string) => {
      confirmPassword.onChange(value);
      clearFormError();
    },
    [clearFormError, confirmPassword]
  );

  const handleSave = useCallback(() => {
    void submit();
  }, [submit]);

  const busy = formState.isSubmitting;

  // Nothing to save until every field has something in it.
  const filled =
    currentPassword.value.length > 0 &&
    newPassword.value.length > 0 &&
    confirmPassword.value.length > 0;

  return (
    <AuthScreen
      action={
        <View className="gap-xs">
          {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}
          <Button
            disabled={!filled || busy}
            isLoading={busy}
            label={t("changePassword.submit")}
            onPress={handleSave}
            size="lg"
            testID="change-password-submit"
          />
        </View>
      }
    >
      <Text variant="muted">{t("changePassword.description")}</Text>
      <VStack className="items-stretch">
        <PasswordInput
          accessibilityLabel={t("changePassword.current")}
          autoComplete="current-password"
          editable={!busy}
          error={currentPasswordState.error?.message}
          onBlur={handleCurrentPasswordBlur}
          onChangeText={handleCurrentPasswordChange}
          onSubmitEditing={focusNewPassword}
          placeholder={t("changePassword.current")}
          ref={currentPasswordRef}
          returnKeyType="next"
          submitBehavior="submit"
          testID="current-password-input"
          textContentType="password"
          value={currentPassword.value}
        />
        <PasswordInput
          accessibilityHint={t("auth.password.minimum", {
            count: PASSWORD_MIN_LENGTH,
          })}
          accessibilityLabel={t("changePassword.new")}
          autoComplete="new-password"
          editable={!busy}
          error={newPasswordState.error?.message}
          onBlur={handleNewPasswordBlur}
          onChangeText={handleNewPasswordChange}
          onSubmitEditing={focusConfirmPassword}
          passwordRules={`minlength: ${PASSWORD_MIN_LENGTH};`}
          placeholder={t("changePassword.new")}
          ref={newPasswordRef}
          returnKeyType="next"
          submitBehavior="submit"
          testID="new-password-input"
          textContentType="newPassword"
          value={newPassword.value}
        />
        <PasswordInput
          accessibilityLabel={t("changePassword.confirm")}
          autoComplete="new-password"
          editable={!busy}
          error={confirmPasswordState.error?.message}
          onBlur={handleConfirmPasswordBlur}
          onChangeText={handleConfirmPasswordChange}
          onSubmitEditing={handleSave}
          passwordRules={`minlength: ${PASSWORD_MIN_LENGTH};`}
          placeholder={t("changePassword.confirm")}
          ref={confirmPasswordRef}
          returnKeyType="go"
          testID="confirm-password-input"
          textContentType="newPassword"
          value={confirmPassword.value}
        />
        {newPasswordState.error ? null : (
          <Text variant="muted">
            {t("auth.password.minimum", { count: PASSWORD_MIN_LENGTH })}
          </Text>
        )}
      </VStack>
    </AuthScreen>
  );
};

export default ChangePasswordView;
