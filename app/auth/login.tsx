import { router } from "expo-router";
import { View } from "react-native";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import LoginView from "~/components/views/login-view";

export default function LoginModal() {
  return (
    <View className="flex flex-col items-center justify-center gap-4 p-4 h-full">
      <LoginView />

      <Button onPress={() => router.back()}>
        <Text>Dismiss modal</Text>
      </Button>
    </View>
  );
}
