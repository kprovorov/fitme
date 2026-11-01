import { Stack } from "expo-router";
import AuthWelcomeView from "~/components/views/auth-welcome-view";
export default function AuthWelcomeScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthWelcomeView />
    </>
  );
}
