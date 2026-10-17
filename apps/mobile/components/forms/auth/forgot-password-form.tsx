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

interface ForgotPasswordFormProps {
  onSubmit: (values: ForgotPasswordFormValues) => Promise<void>;
}

export type ForgotPasswordFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  email: z.email({ error: "Invalid email" }),
});

export default function ForgotPasswordForm({
  onSubmit,
}: ForgotPasswordFormProps) {
  const form = useForm<ForgotPasswordFormValues>({
    defaultValues: {
      email: "",
    },
    resolver: zodResolver(formSchema),
  });

  const { isSubmitting } = form.formState;

  const renderEmailField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<ForgotPasswordFormValues, "email">;
    }) => (
      <Input
        autoCapitalize="none"
        editable={!isSubmitting}
        keyboardType="email-address"
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Email"
        testID="forgot-password-email-input"
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

      <Button
        isLoading={isSubmitting}
        label="Send Code"
        onPress={form.handleSubmit(onSubmit)}
        systemImage="arrow.right"
        testID="forgot-password-button"
      />
    </VStack>
  );
}
