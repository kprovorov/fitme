import { Stack } from "expo-router";

import AuthWelcomeView from "~/components/views/auth-welcome-view";

const AuthWelcomeScreen = () => (
  <>
    <Stack.Screen options={{ headerShown: false }} />
    <AuthWelcomeView />
  </>
);

export default AuthWelcomeScreen;
