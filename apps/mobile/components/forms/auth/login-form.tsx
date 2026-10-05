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
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

interface LoginFormProps {
  errors?: FieldErrors<LoginFormValues>;
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
}

export type LoginFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
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
        editable={!isSubmitting}
        keyboardType="email-address"
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Email"
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
        <Text className="text-red-500">
          {form.formState.errors.email.message}
        </Text>
      ) : null}

      <Controller
        control={form.control}
        name="password"
        render={renderPasswordField}
      />
      {form.formState.errors.password ? (
        <Text className="text-red-500">
          {form.formState.errors.password.message}
        </Text>
      ) : null}

      <Button
        isLoading={isSubmitting}
        label="Continue"
        onPress={form.handleSubmit(onSubmit)}
        systemImage="arrow.right"
        testID="login-button"
      />
    </VStack>
  );
}
