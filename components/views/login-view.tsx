import LoginForm from "@/components/forms/auth/login-form";
import { useLoginMutation } from "@/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import { Button } from "../ui/button";
import { Text } from "../ui/text";

export default function LoginView() {
  const queryClient = useQueryClient();

  const { mutateAsync: login } = useLoginMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      router.replace("/");
    },
  });

  return (
    <VStack className="w-full">
      <LoginForm
        onSubmit={async (values) => {
          await login(values);
        }}
      />
      <P>
        Don't have an account?{" "}
        <Link href="/auth/register" className="text-primary font-semibold">
          Register here
        </Link>
      </P>
    </VStack>
  );
}
