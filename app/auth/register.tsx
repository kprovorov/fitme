import { Stack } from "expo-router";
import { H1, H3, H4, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import RegisterView from "~/components/views/register-view";

export default function LoginModal() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Register",
          headerBackTitle: "Register",
          headerShown: false,
        }}
      />
      <VStack className="h-full p-4 gap-8">
        <VStack className="gap-0">
          <H1>Welcome to Fitme!</H1>
          <H4>Create an account to get started</H4>
        </VStack>
        <RegisterView />
      </VStack>
    </>
  );
}
