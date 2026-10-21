import { View } from "react-native";

/** A sheet's grabber bar, which iOS draws natively. */
export function AndroidGrabber() {
  return (
    <View className="items-center pt-2 pb-1">
      <View className="h-1 w-9 rounded-full bg-muted-foreground" />
    </View>
  );
}
