import { Stack } from "expo-router";

export default function App() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="auth"
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="planner"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
