import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import {
  Controller,
  type ControllerRenderProps,
  type FieldErrors,
  useForm,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { VStack } from "~/components/ui/vstack";

interface LoginFormProps {
  errors?: FieldErrors<LoginFormValues>;
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
}

export type LoginFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  email: z.email({ error: "Invalid email" }),
  // Clerk checks the password; existing Users may have one shorter than
  // Clerk's minimum for new passwords.
  password: z.string().min(1, { error: "Enter your password." }),
});

export default function LoginForm({ onSubmit, errors }: LoginFormProps) {
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
    }: {
      field: ControllerRenderProps<LoginFormValues, "email">;
    }) => (
      <Input
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!isSubmitting}
        keyboardType="email-address"
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Email"
        spellCheck={false}
        testID="login-email-input"
        value={value}
      />
    ),
    [isSubmitting]
  );

  const renderPasswordField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<LoginFormValues, "password">;
    }) => (
      <Input
        editable={!isSubmitting}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Password"
        secureTextEntry
        testID="login-password-input"
        value={value}
      />
    ),
    [isSubmitting]
  );

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
        name="email"
        render={renderEmailField}
      />
      {form.formState.errors.email ? (
        <ErrorMessage>{form.formState.errors.email.message}</ErrorMessage>
      ) : null}

      <Controller
        control={form.control}
        name="password"
        render={renderPasswordField}
      />
      {form.formState.errors.password ? (
        <ErrorMessage>{form.formState.errors.password.message}</ErrorMessage>
      ) : null}

      <Button
        icon="arrow.right"
        iconPosition="trailing"
        isLoading={isSubmitting}
        label="Continue"
        onPress={form.handleSubmit(onSubmit)}
        testID="login-button"
      />
    </VStack>
  );
}
