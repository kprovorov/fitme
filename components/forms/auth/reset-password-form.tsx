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
    <VStack className="gap-4 items-stretch w-full">
      <Controller
        control={form.control}
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            editable={!form.formState.isSubmitting}
            placeholder="New Password"
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

      <Controller
        control={form.control}
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            editable={!form.formState.isSubmitting}
            placeholder="Confirm Password"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            secureTextEntry
          />
        )}
        name="confirmPassword"
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
          <Spinner size={16} className="text-black" />
        ) : (
          <HStack className="gap-2">
            <Text>Update Password</Text>
            <ArrowRight size={16} className="text-black" />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}
