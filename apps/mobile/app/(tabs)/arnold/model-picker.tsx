import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidGrabber } from "@/components/grabber";
import { SymbolImage } from "@/components/symbol-image";
import { useSelectedArnoldModel } from "~/hooks/arnold-model";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";

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
        <Text className="text-body text-foreground">{label}</Text>
        <Text className="text-footnote text-muted-foreground">
          {description}
        </Text>
      </View>
      {selected ? (
        <SymbolImage
          className="text-body-emphasized text-foreground"
          name="checkmark"
        />
      ) : null}
    </Pressable>
  );
}

function NoModels({ isLoading }: { isLoading: boolean }) {
  const { t } = useTranslation(undefined, { i18n });
  if (isLoading) {
    return (
      <View className="items-center px-5 py-8">
        <ActivityIndicator
          accessibilityLabel={t("arnold.modelPicker.loading")}
        />
      </View>
    );
  }
  return (
    <Text className="px-5 py-3.5 text-muted-foreground text-subhead">
      {t("arnold.modelPicker.unavailable")}
    </Text>
  );
}

export default function ModelPickerSheet() {
  const { t } = useTranslation(undefined, { i18n });
  const { isLoading, model, models, setSelectedId } = useSelectedArnoldModel();
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
        <Text className="px-5 pb-2 text-footnote text-muted-foreground">
          {t("arnold.modelPicker.appliesToNextMessage")}
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
