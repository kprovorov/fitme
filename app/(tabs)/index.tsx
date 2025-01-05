import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { View } from "react-native";
import Authenticated from "~/components/authenticated";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { deleteToken } from "~/lib/api";

export default function HomeScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const logout = async () => {
    await deleteToken();
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    router.replace("/auth/login");
  };

  return (
    <Authenticated>
      <View className="flex flex-row gap-4 p-4 items-center justify-center">
        <Text>Welcome, {user?.name}! 👋</Text>
        <Button onPress={() => logout()}>
          <Text>Logout</Text>
        </Button>
      </View>
    </Authenticated>
  );
}
