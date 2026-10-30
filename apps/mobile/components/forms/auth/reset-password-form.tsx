import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useCallback, useMemo } from "react";
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { VStack } from "~/components/ui/vstack";
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";

interface ResetPasswordFormProps {
  onSubmit: (values: ResetPasswordFormValues) => Promise<void>;
}

export type ResetPasswordFormValues = z.infer<
  ReturnType<typeof createFormSchema>
>;

/** The form's rules, their messages in the App language. */
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

export default function ResetPasswordForm({
  onSubmit,
}: ResetPasswordFormProps) {
  const { t } = useTranslation();
  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const form = useForm<ResetPasswordFormValues>({
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
    resolver: zodResolver(formSchema),
  });

  const { isSubmitting } = form.formState;

  const renderPasswordField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<ResetPasswordFormValues, "password">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        editable={!isSubmitting}
        error={error?.message}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={t("resetPassword.newPasswordPlaceholder")}
        secureTextEntry
        testID="reset-password-input"
        value={value}
      />
    ),
    [isSubmitting, t]
  );

  const renderConfirmPasswordField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<ResetPasswordFormValues, "confirmPassword">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        editable={!isSubmitting}
        error={error?.message}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={t("resetPassword.confirmPasswordPlaceholder")}
        secureTextEntry
        testID="reset-password-confirm-input"
        value={value}
      />
    ),
    [isSubmitting, t]
  );

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
        name="password"
        render={renderPasswordField}
      />
      <Controller
        control={form.control}
        name="confirmPassword"
        render={renderConfirmPasswordField}
      />
      <Button
        icon="arrow.right"
        iconPosition="trailing"
        isLoading={isSubmitting}
        label={t("resetPassword.submit")}
        onPress={form.handleSubmit(onSubmit)}
        testID="reset-password-button"
      />
    </VStack>
  );
}
