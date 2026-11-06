import { View } from "react-native";

/** A sheet's grabber bar, which iOS draws natively. */
export const AndroidGrabber = () => (
  <View className="items-center pt-2 pb-1">
    <View className="bg-muted-foreground h-1 w-9 rounded-full" />
  </View>
);
