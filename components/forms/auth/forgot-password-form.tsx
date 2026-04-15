import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { ArrowRight } from "~/lib/icons/ArrowRight";

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
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
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
        disabled={form.formState.isSubmitting}
        onPress={form.handleSubmit(onSubmit)}
      >
        {form.formState.isSubmitting ? (
          <Spinner className="text-black" size={16} />
        ) : (
          <HStack className="gap-2">
            <Text>Send Reset Link</Text>
            <ArrowRight className="text-black" size={16} />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}
