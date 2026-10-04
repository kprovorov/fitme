import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, type FieldErrors, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

interface RegisterFormProps {
  errors?: FieldErrors<RegisterFormValues>;
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
}

export type RegisterFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
});

export default function RegisterForm({ onSubmit, errors }: RegisterFormProps) {
  const form = useForm<RegisterFormValues>({
    defaultValues: {
      email: "",
      name: "",
      password: "",
    },
    errors,
    resolver: zodResolver(formSchema),
  });

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            autoCapitalize="words"
            editable={!form.formState.isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="Name"
            testID="name-input"
            value={value}
          />
        )}
      />
      {form.formState.errors.name ? (
        <Text className="text-red-500">
          {form.formState.errors.name.message}
        </Text>
      ) : null}

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
            testID="email-input"
            value={value}
          />
        )}
      />
      {form.formState.errors.email ? (
        <Text className="text-red-500">
          {form.formState.errors.email.message}
        </Text>
      ) : null}

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
            testID="password-input"
            value={value}
          />
        )}
      />
      {form.formState.errors.password ? (
        <Text className="text-red-500">
          {form.formState.errors.password.message}
        </Text>
      ) : null}

      <Button
        isLoading={form.formState.isSubmitting}
        label="Sign Up"
        onPress={form.handleSubmit(onSubmit)}
        systemImage="arrow.right"
        testID="register-button"
      />
    </VStack>
  );
}
