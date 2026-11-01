import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { type ElementRef, useCallback, useMemo, useRef } from "react";
import { type FieldErrors, useController, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { TextInput } from "react-native";
import { z } from "zod";
import type { AuthFormLayout } from "~/components/auth/auth-screen";
import { PasswordInput } from "~/components/auth/password-input";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";

const createFormSchema = (t: TFunction) =>
  z
    .object({
      confirmPassword: z.string(),
      password: z.string().min(PASSWORD_MIN_LENGTH, {
        error: t("resetPassword.passwordTooShort", {
          count: PASSWORD_MIN_LENGTH,
        }),
      }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      error: t("resetPassword.passwordsDontMatch"),
      path: ["confirmPassword"],
    });
export type ResetPasswordFormValues = z.infer<
  ReturnType<typeof createFormSchema>
>;

interface ResetPasswordFormProps extends AuthFormLayout {
  errors?: FieldErrors<ResetPasswordFormValues>;
  onSubmit: (values: ResetPasswordFormValues) => Promise<void>;
}
export default function ResetPasswordForm({
  children,
  disabled,
  onEdit,
  onSubmit,
  errors,
}: ResetPasswordFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => createFormSchema(t), [t]);
  const { control, handleSubmit, formState } = useForm<ResetPasswordFormValues>(
    {
      defaultValues: { confirmPassword: "", password: "" },
      errors,
      resolver: zodResolver(schema),
    }
  );
  const busy = !!disabled || formState.isSubmitting;
  const submit = useCallback(
    () => handleSubmit(onSubmit)(),
    [handleSubmit, onSubmit]
  );
  const { field: password, fieldState: passwordState } = useController({
    control,
    name: "password",
  });
  const changePassword = useCallback(
    (value: string) => {
      password.onChange(value);
      onEdit?.();
    },
    [password, onEdit]
  );
  const focusConfirmpassword = useCallback(
    () => confirmPasswordRef.current?.focus(),
    []
  );
  const { field: confirmPassword, fieldState: confirmPasswordState } =
    useController({ control, name: "confirmPassword" });
  const changeConfirmpassword = useCallback(
    (value: string) => {
      confirmPassword.onChange(value);
      onEdit?.();
    },
    [confirmPassword, onEdit]
  );
  const confirmPasswordRef = useRef<ElementRef<typeof TextInput>>(null);
  return children({
    action: (
      <Button
        accessibilityLabel={t(
          formState.isSubmitting
            ? "resetPassword.loading"
            : "resetPassword.submit"
        )}
        disabled={!!disabled}
        isLoading={formState.isSubmitting}
        label={t("resetPassword.submit")}
        onPress={submit}
        size="lg"
        testID="reset-password-button"
      />
    ),
    fields: (
      <VStack className="items-stretch gap-sm">
        <PasswordInput
          accessibilityHint={t("auth.password.minimum", {
            count: PASSWORD_MIN_LENGTH,
          })}
          accessibilityLabel={t("resetPassword.newPasswordPlaceholder")}
          autoComplete="new-password"
          editable={!busy}
          error={passwordState.error?.message}
          onBlur={password.onBlur}
          onChangeText={changePassword}
          onSubmitEditing={focusConfirmpassword}
          passwordRules={`minlength: ${PASSWORD_MIN_LENGTH};`}
          placeholder={t("resetPassword.newPasswordPlaceholder")}
          returnKeyType="next"
          testID="reset-password-input"
          textContentType="newPassword"
          value={password.value}
        />
        <PasswordInput
          accessibilityLabel={t("resetPassword.confirmPasswordPlaceholder")}
          autoComplete="new-password"
          editable={!busy}
          error={confirmPasswordState.error?.message}
          onBlur={confirmPassword.onBlur}
          onChangeText={changeConfirmpassword}
          onSubmitEditing={submit}
          passwordRules={`minlength: ${PASSWORD_MIN_LENGTH};`}
          placeholder={t("resetPassword.confirmPasswordPlaceholder")}
          ref={confirmPasswordRef}
          returnKeyType="go"
          testID="reset-password-confirm-input"
          textContentType="newPassword"
          value={confirmPassword.value}
        />
        {passwordState.error ? null : (
          <Text className="text-footnote text-muted-foreground">
            {t("auth.password.minimum", { count: PASSWORD_MIN_LENGTH })}
          </Text>
        )}
      </VStack>
    ),
  });
}
