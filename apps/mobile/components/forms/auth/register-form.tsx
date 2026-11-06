import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useRef } from "react";
import type { ElementRef } from "react";
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
import { Text } from "~/components/ui/text";
import { NAME_MIN_LENGTH, PASSWORD_MIN_LENGTH } from "~/lib/constants";

const registerFormSchema = (t: TFunction) =>
  z.object({
    email: z.email({ error: t("auth.validation.invalidEmail") }),
    name: z
      .string()
      .trim()
      .min(NAME_MIN_LENGTH, {
        error: t("auth.validation.nameTooShort", { count: NAME_MIN_LENGTH }),
      }),
    password: z.string().min(PASSWORD_MIN_LENGTH, {
      error: t("auth.validation.passwordTooShort", {
        count: PASSWORD_MIN_LENGTH,
      }),
    }),
  });

export type RegisterFormValues = z.infer<ReturnType<typeof registerFormSchema>>;

interface RegisterFormProps extends AuthFormLayout {
  errors?: FieldErrors<RegisterFormValues>;
  onSubmit: (values: RegisterFormValues) => Promise<void>;
}

export default function RegisterForm({
  children,
  disabled,
  onEdit,
  onSubmit,
  errors,
}: RegisterFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => registerFormSchema(t), [t]);

  const { control, handleSubmit, formState } = useForm<RegisterFormValues>({
    defaultValues: { email: "", name: "", password: "" },
    errors,
    resolver: zodResolver(schema),
  });

  const busy = !!disabled || formState.isSubmitting;

  const submit = useCallback(
    () => handleSubmit(onSubmit)(),
    [handleSubmit, onSubmit]
  );

  const { field: name, fieldState: nameState } = useController({
    control,
    name: "name",
  });

  const changeName = useCallback(
    (value: string) => {
      name.onChange(value);
      onEdit?.();
    },
    [name, onEdit]
  );

  const emailRef = useRef<ElementRef<typeof TextInput>>(null);
  const focusEmail = useCallback(() => emailRef.current?.focus(), []);

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

  const passwordRef = useRef<ElementRef<typeof TextInput>>(null);
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

  const { onBlur: handleNameBlur } = name;
  const { onBlur: handleEmailBlur } = email;
  const { onBlur: handlePasswordBlur } = password;

  return children({
    action: (
      <Button
        accessibilityLabel={t(
          formState.isSubmitting
            ? "auth.register.loading"
            : "auth.register.submit"
        )}
        disabled={!!disabled}
        isLoading={formState.isSubmitting}
        label={t("auth.register.submit")}
        onPress={submit}
        size="lg"
        testID="register-button"
      />
    ),
    fields: (
      <View className="gap-sm flex flex-col items-stretch justify-center">
        <Input
          accessibilityLabel={t("auth.fields.name")}
          autoCapitalize="words"
          autoComplete="name"
          editable={!busy}
          error={nameState.error?.message}
          onBlur={handleNameBlur}
          onChangeText={changeName}
          onSubmitEditing={focusEmail}
          placeholder={t("auth.fields.name")}
          returnKeyType="next"
          testID="name-input"
          textContentType="name"
          value={name.value}
        />
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
          ref={emailRef}
          returnKeyType="next"
          spellCheck={false}
          testID="email-input"
          textContentType="emailAddress"
          value={email.value}
        />
        <PasswordInput
          accessibilityHint={t("auth.password.minimum", {
            count: PASSWORD_MIN_LENGTH,
          })}
          accessibilityLabel={t("auth.fields.passwordPlaceholder")}
          autoComplete="new-password"
          editable={!busy}
          error={passwordState.error?.message}
          onBlur={handlePasswordBlur}
          onChangeText={changePassword}
          onSubmitEditing={submit}
          passwordRules={`minlength: ${PASSWORD_MIN_LENGTH};`}
          placeholder={t("auth.fields.passwordPlaceholder")}
          ref={passwordRef}
          returnKeyType="go"
          testID="password-input"
          textContentType="newPassword"
          value={password.value}
        />
        {passwordState.error ? null : (
          <Text variant="muted">
            {t("auth.password.minimum", { count: PASSWORD_MIN_LENGTH })}
          </Text>
        )}
      </View>
    ),
  });
}
