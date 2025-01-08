import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import RegisterView from "~/components/views/register-view";

export default function LoginModal() {
  return (
    <VStack className="h-full p-4">
      <H1>Register</H1>
      <RegisterView />
    </VStack>
  );
}
