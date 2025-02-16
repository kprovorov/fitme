import { Controller, FieldErrors, useForm } from "react-hook-form";
import { View } from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { VStack } from "~/components/ui/vstack";
import { HStack } from "~/components/ui/hstack";
import { ArrowRight } from "~/lib/icons/ArrowRight";

interface RegisterFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  errors?: FieldErrors<RegisterFormValues>;
}

export type RegisterFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  email: z.string().email(),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
});

export default function RegisterForm({ onSubmit, errors }: RegisterFormProps) {
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
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
            placeholder="Name"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            autoCapitalize="words"
          />
        )}
        name="name"
      />
      {form.formState.errors.name && (
        <Text className="text-red-500">
          {form.formState.errors.name.message}
        </Text>
      )}

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
      >
        {form.formState.isSubmitting ? (
          <View className="animate-spin">
            <LoaderCircle size={16} className="text-black" />
          </View>
        ) : (
          <HStack className="gap-2">
            <Text>Sign Up</Text>
            <ArrowRight size={16} className="text-black" />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}
