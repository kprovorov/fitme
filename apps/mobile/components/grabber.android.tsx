import { Minus } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/icon";

export function AndroidGrabber() {
  return (
    <View className="items-center pt-2 pb-1">
      <Icon
        className="h-8 w-8 text-muted-foreground"
        icon={Minus}
        strokeWidth={4}
      />
    </View>
  );
}
