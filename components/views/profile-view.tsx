import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { deleteToken } from "~/lib/api";
import { VStack } from "../ui/vstack";

export default function ProfileView() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const logout = async () => {
    await deleteToken();
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    router.replace("/auth/login");
  };

  return (
    !!user && (
      <VStack>
        <Text>Welcome, {user.name}! 👋</Text>
        <Button onPress={() => logout()}>
          <Text>Logout</Text>
        </Button>
      </VStack>
    )
  );
}
