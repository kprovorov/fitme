import { ThemedText } from "@/components/ThemedText";
import LoginView from "@/components/views/login-view";
import { useCurrentUserQuery } from "@/hooks/queries/auth";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { Button, ScrollView } from "react-native";
import { ThemedView } from "~/components/ThemedView";
import { deleteToken } from "~/lib/api";

export default function LoginScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const logout = async () => {
    await deleteToken();
    await queryClient.invalidateQueries({ queryKey: ["api/user"] });
  };

  return (
    <ScrollView>
      <ThemedText>LoginScreen</ThemedText>
      {user ? (
        <ThemedView>
          <ThemedText>Welcome, {user.name}! 👋</ThemedText>
          <Button title="Logout" onPress={() => logout()} />
        </ThemedView>
      ) : (
        <LoginView />
      )}
    </ScrollView>
  );
}
