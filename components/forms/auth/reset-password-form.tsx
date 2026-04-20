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

interface ResetPasswordFormProps {
  onSubmit: (values: ResetPasswordFormValues) => Promise<void>;
}

export type ResetPasswordFormValues = z.infer<typeof formSchema>;

const formSchema = z
  .object({
    password: z.string().min(6, {
      message: "Password must be at least 6 characters.",
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export default function ResetPasswordForm({
  onSubmit,
}: ResetPasswordFormProps) {
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  return (
    <VStack className="w-full items-stretch gap-4">
      <Controller
        control={form.control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            editable={!form.formState.isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="New Password"
            secureTextEntry
            value={value}
          />
        )}
      />
      {form.formState.errors.password && (
        <Text className="text-red-500">
          {form.formState.errors.password.message}
        </Text>
      )}

      <Controller
        control={form.control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            editable={!form.formState.isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="Confirm Password"
            secureTextEntry
            value={value}
          />
        )}
      />
      {form.formState.errors.confirmPassword && (
        <Text className="text-red-500">
          {form.formState.errors.confirmPassword.message}
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
            <Text>Update Password</Text>
            <ArrowRight className="text-black" size={16} />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}
