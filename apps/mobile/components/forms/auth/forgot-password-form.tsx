import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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
  email: z.string().email(),
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

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            autoCapitalize="none"
            editable={!form.formState.isSubmitting}
            keyboardType="email-address"
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="Email"
            value={value}
          />
        )}
      />
      {form.formState.errors.email && (
        <Text className="text-red-500">
          {form.formState.errors.email.message}
        </Text>
      )}

      <Button
        isLoading={form.formState.isSubmitting}
        label="Send Reset Link"
        onPress={form.handleSubmit(onSubmit)}
        systemImage="arrow.right"
      />
    </VStack>
  );
}
