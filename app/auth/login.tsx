import { Stack } from "expo-router";
import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import LoginView from "~/components/views/login-view";

export default function LoginModal() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Login",
          headerBackTitle: "Login",
        }}
      />
      <VStack className="h-full p-4">
        <H1>Login</H1>
        <LoginView />
      </VStack>
    </>
  );
}
