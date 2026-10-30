import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useCallback, useMemo } from "react";
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldErrors,
  useForm,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { VStack } from "~/components/ui/vstack";

interface LoginFormProps {
  errors?: FieldErrors<LoginFormValues>;
  onSubmit: (values: LoginFormValues) => Promise<void>;
}

/** The form's schema, its messages in the App language. */
const loginFormSchema = (t: TFunction) =>
  z.object({
    email: z.email({ error: t("auth.validation.invalidEmail") }),
    // Clerk checks the password; existing Users may have one shorter than
    // Clerk's minimum for new passwords.
    password: z
      .string()
      .min(1, { error: t("auth.validation.passwordRequired") }),
  });

export type LoginFormValues = z.infer<ReturnType<typeof loginFormSchema>>;

export default function LoginForm({ onSubmit, errors }: LoginFormProps) {
  const { t } = useTranslation();
  const formSchema = useMemo(() => loginFormSchema(t), [t]);
  const form = useForm<LoginFormValues>({
    defaultValues: {
      email: "",
      password: "",
    },
    errors,
    resolver: zodResolver(formSchema),
  });

  const { isSubmitting } = form.formState;

  const renderEmailField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<LoginFormValues, "email">;
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
        placeholder={t("auth.fields.email")}
        spellCheck={false}
        testID="login-email-input"
        value={value}
      />
    ),
    [isSubmitting, t]
  );

  const renderPasswordField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<LoginFormValues, "password">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        editable={!isSubmitting}
        error={error?.message}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={t("auth.fields.passwordPlaceholder")}
        secureTextEntry
        testID="login-password-input"
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
      <Controller
        control={form.control}
        name="password"
        render={renderPasswordField}
      />
      <Button
        icon="arrow.right"
        iconPosition="trailing"
        isLoading={isSubmitting}
        label={t("auth.login.continue")}
        onPress={form.handleSubmit(onSubmit)}
        testID="login-button"
      />
    </VStack>
  );
}
