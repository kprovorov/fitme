import { View } from "react-native";
import Authenticated from "~/components/authenticated";
import { Text } from "~/components/ui/text";

export default function HomeScreen() {
  return (
    <Authenticated>
      <View className="flex flex-row gap-4 p-4 items-center justify-center">
        <Text>Home</Text>
      </View>
    </Authenticated>
  );
}
