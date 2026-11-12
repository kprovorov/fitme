import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useRef } from "react";
import type { ComponentRef } from "react";
import { useController, useForm } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { TextInput } from "react-native";
import { z } from "zod";

import type { AuthFormLayout } from "~/components/auth/auth-screen";
import { PasswordInput } from "~/components/auth/password-input";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

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

  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
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

  const { onBlur: handleEmailBlur } = email;
  const { onBlur: handlePasswordBlur } = password;

  return children({
    action: (
      <Button
        accessibilityLabel={t(
          formState.isSubmitting ? "auth.login.loading" : "auth.login.continue"
        )}
        disabled={!!disabled}
        isLoading={formState.isSubmitting}
        label={t("auth.login.continue")}
        onPress={(...args) => {
          void submit(...args);
        }}
        size="lg"
        testID="login-button"
      />
    ),
    fields: (
      <View className="gap-sm flex flex-col items-stretch justify-center">
        <Input
          accessibilityLabel={t("auth.fields.email")}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!busy}
          error={emailState.error?.message}
          keyboardType="email-address"
          onBlur={handleEmailBlur}
          onChangeText={changeEmail}
          onSubmitEditing={focusPassword}
          placeholder={t("auth.fields.email")}
          returnKeyType="next"
          submitBehavior="submit"
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
          onBlur={handlePasswordBlur}
          onChangeText={changePassword}
          onSubmitEditing={submit}
          placeholder={t("auth.fields.passwordPlaceholder")}
          ref={passwordRef}
          returnKeyType="go"
          testID="login-password-input"
          textContentType="password"
          value={password.value}
        />
      </View>
    ),
  });
}
