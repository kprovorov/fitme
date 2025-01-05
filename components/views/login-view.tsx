import LoginForm from "@/components/forms/auth/login-form";
import { useLoginMutation } from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

export default function LoginView() {
  const queryClient = useQueryClient();

  const { mutateAsync: login } = useLoginMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      router.replace("/");
    },
  });

  return (
    <LoginForm
      onSubmit={async (values) => {
        await login(values);
      }}
    />
  );
}
