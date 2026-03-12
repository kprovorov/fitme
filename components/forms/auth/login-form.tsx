import { Controller, FieldErrors, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Spinner } from "~/components/ui/spinner";
import { VStack } from "~/components/ui/vstack";
import { HStack } from "~/components/ui/hstack";
import { ArrowRight } from "~/lib/icons/ArrowRight";

interface LoginFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  errors?: FieldErrors<LoginFormValues>;
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
            testID="email-input"
          />
        )}
        name="email"
      />
      {form.formState.errors.email && (
        <Text className="text-red-500">
          {form.formState.errors.email.message}
        </Text>
      )}

      <Controller
        control={form.control}
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            editable={!form.formState.isSubmitting}
            placeholder="Password"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            secureTextEntry
            testID="password-input"
          />
        )}
        name="password"
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
          <Spinner size={16} className="text-black" />
        ) : (
          <HStack className="gap-2">
            <Text>Continue</Text>
            <ArrowRight size={16} className="text-black" />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}
