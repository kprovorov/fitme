import { coachModels } from "@fitme/core";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";
import { useSelectedCoachModel } from "~/lib/coach-model";

const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
} as const;

function ModelRow({
  description,
  label,
  provider,
  selected,
  onPress,
}: {
  description: string;
  label: string;
  provider: keyof typeof PROVIDER_LABELS;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-3.5 px-5 py-3.5 active:bg-muted"
      onPress={onPress}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-[17px] text-foreground">{label}</Text>
          <Text className="text-[12px] text-muted-foreground">
            {PROVIDER_LABELS[provider]}
          </Text>
        </View>
        <Text className="text-[13px] text-muted-foreground">{description}</Text>
      </View>
      {selected && <Icon className="h-5 w-5 text-foreground" icon={Check} />}
    </Pressable>
  );
}

export default function ModelPickerSheet() {
  const { selectedId, setSelectedId } = useSelectedCoachModel();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
      <View className="pt-2 pb-4">
        <Text className="px-5 pb-2 text-[13px] text-muted-foreground">
          Applies to your next message
        </Text>
        {coachModels.map((model) => (
          <ModelRow
            description={model.description}
            key={model.id}
            label={model.label}
            onPress={() => {
              setSelectedId(model.id);
              router.back();
            }}
            provider={model.provider}
            selected={model.id === selectedId}
          />
        ))}
      </View>
    </ScrollView>
  );
}
