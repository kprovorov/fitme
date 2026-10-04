import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import {
  Controller,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

interface ResetPasswordFormProps {
  onSubmit: (values: ResetPasswordFormValues) => Promise<void>;
}

export type ResetPasswordFormValues = z.infer<typeof formSchema>;

const formSchema = z
  .object({
    confirmPassword: z.string(),
    password: z.string().min(6, {
      message: "Password must be at least 6 characters.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
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
        <Text className="text-red-500">
          {form.formState.errors.password.message}
        </Text>
      ) : null}

      <Controller
        control={form.control}
        name="confirmPassword"
        render={renderConfirmPasswordField}
      />
      {form.formState.errors.confirmPassword ? (
        <Text className="text-red-500">
          {form.formState.errors.confirmPassword.message}
        </Text>
      ) : null}

      <Button
        isLoading={isSubmitting}
        label="Update Password"
        onPress={form.handleSubmit(onSubmit)}
        systemImage="arrow.right"
      />
    </VStack>
  );
}
