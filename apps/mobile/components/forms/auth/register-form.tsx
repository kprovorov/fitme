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
import { NAME_MIN_LENGTH, PASSWORD_MIN_LENGTH } from "~/lib/constants";

interface RegisterFormProps {
  errors?: FieldErrors<RegisterFormValues>;
  onSubmit: (values: RegisterFormValues) => Promise<void>;
}

/** The form's schema, its messages in the App language. */
const registerFormSchema = (t: TFunction) =>
  z.object({
    email: z.email({ error: t("auth.validation.invalidEmail") }),
    name: z.string().min(NAME_MIN_LENGTH, {
      error: t("auth.validation.nameTooShort", { count: NAME_MIN_LENGTH }),
    }),
    password: z.string().min(PASSWORD_MIN_LENGTH, {
      error: t("auth.validation.passwordTooShort", {
        count: PASSWORD_MIN_LENGTH,
      }),
    }),
  });

export type RegisterFormValues = z.infer<ReturnType<typeof registerFormSchema>>;

export default function RegisterForm({ onSubmit, errors }: RegisterFormProps) {
  const { t } = useTranslation();
  const formSchema = useMemo(() => registerFormSchema(t), [t]);
  const form = useForm<RegisterFormValues>({
    defaultValues: {
      email: "",
      name: "",
      password: "",
    },
    errors,
    resolver: zodResolver(formSchema),
  });

  const { isSubmitting } = form.formState;

  const renderNameField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<RegisterFormValues, "name">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        autoCapitalize="words"
        editable={!isSubmitting}
        error={error?.message}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={t("auth.fields.name")}
        testID="name-input"
        value={value}
      />
    ),
    [isSubmitting, t]
  );

  const renderEmailField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<RegisterFormValues, "email">;
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
        testID="email-input"
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
      field: ControllerRenderProps<RegisterFormValues, "password">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        editable={!isSubmitting}
        error={error?.message}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={t("auth.fields.passwordPlaceholder")}
        secureTextEntry
        testID="password-input"
        value={value}
      />
    ),
    [isSubmitting, t]
  );

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller control={form.control} name="name" render={renderNameField} />
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
        label={t("auth.register.submit")}
        onPress={form.handleSubmit(onSubmit)}
        testID="register-button"
      />
    </VStack>
  );
}
