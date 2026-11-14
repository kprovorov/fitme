import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
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
import { GLASS_ENABLED } from "~/components/ui/swift-ui";
import { useSelectedArnoldModel } from "~/hooks/arnold-model";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";

const ModelRow = ({
  id,
  label,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) => {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className="active:bg-muted flex-row items-center gap-3.5 px-5 py-3.5"
      onPress={handlePress}
    >
      <Text className="text-body text-foreground flex-1">{label}</Text>
      {selected ? (
        <SymbolImage
          className="text-body-emphasized text-foreground"
          name="checkmark"
        />
      ) : null}
    </Pressable>
  );
};

const NoModels = ({ isLoading }: { isLoading: boolean }) => {
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
    <Text className="text-muted-foreground text-subhead px-5 py-3.5">
      {t("arnold.modelPicker.unavailable")}
    </Text>
  );
};

/**
 * The models Arnold can answer with. The sheet fits its contents, and a glass
 * header floats over them, so the list clears the header with its own
 * padding: the scroll view's automatic inset would push the last row below
 * the height the sheet measured. It still scrolls, for when the rows outgrow
 * the screen (the largest text size on the smallest iPhone).
 */
const ModelPickerSheet = () => {
  const { t } = useTranslation(undefined, { i18n });
  const { isLoading, model, models, setSelectedId } = useSelectedArnoldModel();
  const headerHeight = useHeaderHeight();
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
      contentContainerStyle={{
        // iOS floats the sheet above the home indicator itself.
        paddingBottom:
          process.env.EXPO_OS === "android" ? insets.bottom : undefined,
        paddingTop: GLASS_ENABLED ? headerHeight : undefined,
      }}
      contentInsetAdjustmentBehavior="never"
      scrollIndicatorInsets={{ top: GLASS_ENABLED ? headerHeight : 0 }}
    >
      <AndroidGrabber />
      <View className="pt-2 pb-4">
        <Text className="text-footnote text-muted-foreground px-5 pb-2">
          {t("arnold.modelPicker.appliesToNextMessage")}
        </Text>
        {models ? (
          models.map((candidate) => (
            <ModelRow
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
};

export default ModelPickerSheet;
