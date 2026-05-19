import type { LucideIcon } from "lucide-react-native";
import { Archive, Pencil, Sparkles, Star, Trash2 } from "lucide-react-native";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";
import { useModel } from "@/components/model-context";
import { cn } from "@/utils/tailwind";

function ActionRow({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      className="flex-row items-center gap-3.5 px-5 py-3.5 active:bg-muted"
      onPress={onPress}
    >
      <Icon
        className={cn(
          "h-5 w-5",
          destructive ? "text-red-500" : "text-foreground"
        )}
        icon={icon}
      />
      <Text
        className={cn(
          "flex-1 text-[17px]",
          destructive ? "text-red-500" : "text-foreground"
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function ModelPickerSheet() {
  const { extendedThinking, setExtendedThinking } = useModel();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingBottom:
          process.env.EXPO_OS === "android" ? insets.bottom : undefined,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <AndroidGrabber />
      <View className="pt-2">
        <ActionRow icon={Archive} label="Add to project" />
        <ActionRow icon={Star} label="Star" />
        <ActionRow icon={Pencil} label="Rename" />
        <ActionRow destructive icon={Trash2} label="Delete" />
      </View>

      <View className="mx-5 my-1 h-px bg-border" />

      <View className="flex-row items-center gap-3.5 px-5 py-3">
        <Icon className="h-5 w-5 text-foreground" icon={Sparkles} />
        <View className="flex-1">
          <Text className="text-[17px] text-foreground">Extended thinking</Text>
          <Text className="text-[13px] text-muted-foreground">
            Think longer for complex tasks
          </Text>
        </View>
        <Switch onValueChange={setExtendedThinking} value={extendedThinking} />
      </View>
    </ScrollView>
  );
}
