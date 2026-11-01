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
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
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
  const emailRef = useRef<ElementRef<typeof TextInput>>(null);
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
      <VStack className="items-stretch gap-sm">
        <Input
          accessibilityLabel={t("auth.fields.name")}
          autoCapitalize="words"
          autoComplete="name"
          editable={!busy}
          error={nameState.error?.message}
          onBlur={name.onBlur}
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
          onBlur={email.onBlur}
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
          onBlur={password.onBlur}
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
          <Text className="text-footnote text-muted-foreground">
            {t("auth.password.minimum", { count: PASSWORD_MIN_LENGTH })}
          </Text>
        )}
      </VStack>
    ),
  });
}
