import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, type FieldErrors, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { ArrowRight } from "~/lib/icons/ArrowRight";

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
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    errors,
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
            testID="login-email-input"
            value={value}
          />
        )}
      />
      {form.formState.errors.email && (
        <Text className="text-red-500">
          {form.formState.errors.email.message}
        </Text>
      )}

      <Controller
        control={form.control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            editable={!form.formState.isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="Password"
            secureTextEntry
            testID="login-password-input"
            value={value}
          />
        )}
      />
      {form.formState.errors.password && (
        <Text className="text-red-500">
          {form.formState.errors.password.message}
        </Text>
      )}

      <Button
        disabled={form.formState.isSubmitting}
        onPress={form.handleSubmit(onSubmit)}
        testID="login-button"
      >
        {form.formState.isSubmitting ? (
          <Spinner className="text-black" size={16} />
        ) : (
          <HStack className="gap-2">
            <Text>Continue</Text>
            <ArrowRight className="text-black" size={16} />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}
