import LoginForm from "@/components/forms/auth/login-form";
import { useLoginMutation } from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";

export default function LoginView() {
  const queryClient = useQueryClient();

  const { mutate: login } = useLoginMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/user"] });
    },
  });

  return <LoginForm onSubmit={login} />;
}
