import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";
import { useSelectedCoachModel } from "~/hooks/coach-model";

function ModelRow({
  description,
  id,
  label,
  selected,
  onSelect,
}: {
  description: string;
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-3.5 px-5 py-3.5 active:bg-muted"
      onPress={handlePress}
    >
      <View className="flex-1">
        <Text className="text-[17px] text-foreground">{label}</Text>
        <Text className="text-[13px] text-muted-foreground">{description}</Text>
      </View>
      {selected ? (
        <Icon className="h-5 w-5 text-foreground" icon={Check} />
      ) : null}
    </Pressable>
  );
}

function NoModels({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <View className="items-center px-5 py-8">
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <Text className="px-5 py-3.5 text-[15px] text-muted-foreground">
      Models aren't available right now. Your messages use the Coach's default
      model.
    </Text>
  );
}

export default function ModelPickerSheet() {
  const { isLoading, model, models, setSelectedId } = useSelectedCoachModel();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      router.back();
    },
    [router, setSelectedId]
  );

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
        {models ? (
          models.map((candidate) => (
            <ModelRow
              description={candidate.description}
              id={candidate.id}
              key={candidate.id}
              label={candidate.label}
              onSelect={handleSelect}
              selected={candidate.id === model?.id}
            />
          ))
        ) : (
          <NoModels isLoading={isLoading} />
        )}
      </View>
    </ScrollView>
  );
}
