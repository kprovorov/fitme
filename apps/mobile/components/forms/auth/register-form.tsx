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
import { PASSWORD_MIN_LENGTH } from "~/lib/constants";

interface RegisterFormProps {
  errors?: FieldErrors<RegisterFormValues>;
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
}

export type RegisterFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  email: z.email({ error: "Invalid email" }),
  name: z.string().min(2, {
    error: "Name must be at least 2 characters.",
  }),
  password: z.string().min(PASSWORD_MIN_LENGTH, {
    error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
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

  const { isSubmitting } = form.formState;

  const renderNameField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<RegisterFormValues, "name">;
    }) => (
      <Input
        autoCapitalize="words"
        editable={!isSubmitting}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Name"
        testID="name-input"
        value={value}
      />
    ),
    [isSubmitting]
  );

  const renderEmailField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<RegisterFormValues, "email">;
    }) => (
      <Input
        autoCapitalize="none"
        editable={!isSubmitting}
        keyboardType="email-address"
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Email"
        testID="email-input"
        value={value}
      />
    ),
    [isSubmitting]
  );

  const renderPasswordField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<RegisterFormValues, "password">;
    }) => (
      <Input
        editable={!isSubmitting}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder="Password"
        secureTextEntry
        testID="password-input"
        value={value}
      />
    ),
    [isSubmitting]
  );

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller control={form.control} name="name" render={renderNameField} />
      {form.formState.errors.name ? (
        <Text className="text-red-500">
          {form.formState.errors.name.message}
        </Text>
      ) : null}

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
        label="Sign Up"
        onPress={form.handleSubmit(onSubmit)}
        systemImage="arrow.right"
        testID="register-button"
      />
    </VStack>
  );
}
