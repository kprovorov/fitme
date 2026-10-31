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
import { Input } from "~/components/ui/input";
import { VStack } from "~/components/ui/vstack";

const loginFormSchema = (t: TFunction) =>
  z.object({
    email: z.email({ error: t("auth.validation.invalidEmail") }),
    password: z
      .string()
      .min(1, { error: t("auth.validation.passwordRequired") }),
  });
export type LoginFormValues = z.infer<ReturnType<typeof loginFormSchema>>;

interface LoginFormProps extends AuthFormLayout {
  errors?: FieldErrors<LoginFormValues>;
  onSubmit: (values: LoginFormValues) => Promise<void>;
}
export default function LoginForm({
  children,
  disabled,
  onEdit,
  onSubmit,
  errors,
}: LoginFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => loginFormSchema(t), [t]);
  const { control, handleSubmit, formState } = useForm<LoginFormValues>({
    defaultValues: { email: "", password: "" },
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
  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);
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
  const passwordRef = useRef<ElementRef<typeof TextInput>>(null);
  return children({
    action: (
      <Button
        accessibilityLabel={t(
          formState.isSubmitting ? "auth.login.loading" : "auth.login.continue"
        )}
        disabled={!!disabled}
        isLoading={formState.isSubmitting}
        label={t("auth.login.continue")}
        onPress={submit}
        size="lg"
        testID="login-button"
      />
    ),
    fields: (
      <VStack className="items-stretch gap-sm">
        <Input
          accessibilityLabel={t("auth.fields.email")}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!busy}
          error={emailState.error?.message}
          keyboardType="email-address"
          onBlur={email.onBlur}
          onChangeText={changeEmail}
          onSubmitEditing={focusPassword}
          placeholder={t("auth.fields.email")}
          returnKeyType="next"
          spellCheck={false}
          testID="login-email-input"
          textContentType="emailAddress"
          value={email.value}
        />
        <PasswordInput
          accessibilityLabel={t("auth.fields.passwordPlaceholder")}
          autoComplete="current-password"
          editable={!busy}
          error={passwordState.error?.message}
          onBlur={password.onBlur}
          onChangeText={changePassword}
          onSubmitEditing={submit}
          placeholder={t("auth.fields.passwordPlaceholder")}
          ref={passwordRef}
          returnKeyType="go"
          testID="login-password-input"
          textContentType="password"
          value={password.value}
        />
      </VStack>
    ),
  });
}
