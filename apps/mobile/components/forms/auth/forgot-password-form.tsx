import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useCallback, useMemo } from "react";
import { type FieldErrors, useController, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { AuthFormLayout } from "~/components/auth/auth-screen";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { VStack } from "~/components/ui/vstack";

const createFormSchema = (t: TFunction) =>
  z.object({ email: z.email({ error: t("forgotPassword.invalidEmail") }) });
export type ForgotPasswordFormValues = z.infer<
  ReturnType<typeof createFormSchema>
>;

interface ForgotPasswordFormProps extends AuthFormLayout {
  errors?: FieldErrors<ForgotPasswordFormValues>;
  onSubmit: (values: ForgotPasswordFormValues) => Promise<void>;
}
export default function ForgotPasswordForm({
  children,
  disabled,
  onEdit,
  onSubmit,
  errors,
}: ForgotPasswordFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => createFormSchema(t), [t]);
  const { control, handleSubmit, formState } =
    useForm<ForgotPasswordFormValues>({
      defaultValues: { email: "" },
      errors,
      resolver: zodResolver(schema),
    });
  const busy = !!disabled || formState.isSubmitting;
  const submit = useCallback(
    () => handleSubmit(onSubmit)(),
    [handleSubmit, onSubmit]
  );
  const { field: email, fieldState: emailState } = useController({
    control,
    name: "email",
  });
  const changeEmail = useCallback(
    (value: string) => {
      email.onChange(value);
      onEdit?.();
    },
    [email, onEdit]
  );
  return children({
    action: (
      <Button
        accessibilityLabel={t(
          formState.isSubmitting
            ? "forgotPassword.loading"
            : "forgotPassword.submit"
        )}
        disabled={!!disabled}
        isLoading={formState.isSubmitting}
        label={t("forgotPassword.submit")}
        onPress={submit}
        size="lg"
        testID="forgot-password-button"
      />
    ),
    fields: (
      <VStack className="items-stretch gap-sm">
        <Input
          accessibilityLabel={t("forgotPassword.emailPlaceholder")}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!busy}
          error={emailState.error?.message}
          keyboardType="email-address"
          onBlur={email.onBlur}
          onChangeText={changeEmail}
          onSubmitEditing={submit}
          placeholder={t("forgotPassword.emailPlaceholder")}
          returnKeyType="go"
          spellCheck={false}
          testID="forgot-password-email-input"
          textContentType="emailAddress"
          value={email.value}
        />
      </VStack>
    ),
  });
}
