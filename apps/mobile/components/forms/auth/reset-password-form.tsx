import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import {
  Controller,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { VStack } from "~/components/ui/vstack";
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";

interface ResetPasswordFormProps {
  onSubmit: (values: ResetPasswordFormValues) => Promise<void>;
}

export type ResetPasswordFormValues = z.infer<typeof formSchema>;

const formSchema = z
  .object({
    confirmPassword: z.string(),
    password: z.string().min(PASSWORD_MIN_LENGTH, {
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export default function ResetPasswordForm({
  onSubmit,
}: ResetPasswordFormProps) {
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
    }: {
      field: ControllerRenderProps<ResetPasswordFormValues, "password">;
    }) => (
      <Input
        editable={!isSubmitting}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="New Password"
        secureTextEntry
        testID="reset-password-input"
        value={value}
      />
    ),
    [isSubmitting]
  );

  const renderConfirmPasswordField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<ResetPasswordFormValues, "confirmPassword">;
    }) => (
      <Input
        editable={!isSubmitting}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Confirm Password"
        secureTextEntry
        testID="reset-password-confirm-input"
        value={value}
      />
    ),
    [isSubmitting]
  );

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
        name="password"
        render={renderPasswordField}
      />
      {form.formState.errors.password ? (
        <ErrorMessage>{form.formState.errors.password.message}</ErrorMessage>
      ) : null}

      <Controller
        control={form.control}
        name="confirmPassword"
        render={renderConfirmPasswordField}
      />
      {form.formState.errors.confirmPassword ? (
        <ErrorMessage>
          {form.formState.errors.confirmPassword.message}
        </ErrorMessage>
      ) : null}

      <Button
        isLoading={isSubmitting}
        label="Update Password"
        onPress={form.handleSubmit(onSubmit)}
        systemImage="arrow.right"
        testID="reset-password-button"
      />
    </VStack>
  );
}
