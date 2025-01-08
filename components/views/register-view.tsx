import { useRegisterMutation } from "@/hooks/mutations/auth";
import { Link, router } from "expo-router";
import { VStack } from "../ui/vstack";
import { P } from "../ui/typography";
import RegisterForm from "../forms/auth/register-form";

export default function LoginView() {
  const { mutateAsync: register } = useRegisterMutation({
    onSuccess: async () => {
      router.replace("/");
    },
  });

  return (
    <VStack className="w-full">
      <RegisterForm
        onSubmit={async (values) => {
          await register(values);
        }}
      />
      <P>
        Already have an account?{" "}
        <Link href="/auth/login" className="text-primary font-semibold">
          Login here
        </Link>
      </P>
    </VStack>
  );
}
