import { ThemedText } from "@/components/ThemedText";
import LoginView from "@/components/views/login-view";
import { useCurrentUserQuery } from "@/hooks/queries/auth";
import React from "react";
import { ScrollView } from "react-native";

export default function LoginScreen() {
  const { data: user } = useCurrentUserQuery();

  return (
    <ScrollView>
      <ThemedText>LoginScreen</ThemedText>
      {user ? <ThemedText>Welcome, {user.name}! 👋</ThemedText> : <LoginView />}
    </ScrollView>
  );
}
