import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Spinner } from "~/components/ui/spinner";
import { VStack } from "~/components/ui/vstack";
import { HStack } from "~/components/ui/hstack";
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
    <VStack className="gap-4 items-stretch w-full">
      <Controller
        control={form.control}
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            editable={!form.formState.isSubmitting}
            placeholder="Email"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}
        name="email"
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
          <Spinner size={16} className="text-black" />
        ) : (
          <HStack className="gap-2">
            <Text>Send Reset Link</Text>
            <ArrowRight size={16} className="text-black" />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}
