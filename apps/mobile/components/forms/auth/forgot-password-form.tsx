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

interface ForgotPasswordFormProps {
  onSubmit: (values: ForgotPasswordFormValues) => Promise<void>;
}

export type ForgotPasswordFormValues = z.infer<
  ReturnType<typeof createFormSchema>
>;

/** The form's rules, their messages in the App language. */
const createFormSchema = (t: TFunction) =>
  z.object({
    email: z.email({ error: t("forgotPassword.invalidEmail") }),
  });

export default function ForgotPasswordForm({
  onSubmit,
}: ForgotPasswordFormProps) {
  const { t } = useTranslation();
  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const form = useForm<ForgotPasswordFormValues>({
    defaultValues: {
      email: "",
    },
    resolver: zodResolver(formSchema),
  });

  const { isSubmitting } = form.formState;

  const renderEmailField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<ForgotPasswordFormValues, "email">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!isSubmitting}
        error={error?.message}
        keyboardType="email-address"
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={t("forgotPassword.emailPlaceholder")}
        spellCheck={false}
        testID="forgot-password-email-input"
        value={value}
      />
    ),
    [isSubmitting, t]
  );

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
        name="email"
        render={renderEmailField}
      />
      <Button
        icon="arrow.right"
        iconPosition="trailing"
        isLoading={isSubmitting}
        label={t("forgotPassword.submit")}
        onPress={form.handleSubmit(onSubmit)}
        testID="forgot-password-button"
      />
    </VStack>
  );
}
