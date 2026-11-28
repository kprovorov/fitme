import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { SymbolImage } from "@/components/symbol-image";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { useSelectedArnoldModel } from "~/hooks/arnold-model";

/**
 * The Arnold screen's header title with the Arnold redesign on (Figma, the
 * Arnold page's header frames): "Arnold" with the model the next message runs
 * on under it, opening a native menu of the served models with the current
 * one checked. A pick is saved as the model picker saves it. Without a served
 * list (offline, first run) it's "Arnold" alone and opens nothing, and chat
 * still works on Arnold's default model.
 *
 * It reads the model itself rather than through the screen's header options,
 * so a pick re-renders the title without the options being set again.
 */
export const ArnoldTitle = () => {
  const { t } = useTranslation();
  const { model, models, setSelectedId } = useSelectedArnoldModel();

  if (!(model && models && setSelectedId)) {
    return (
      <Text
        accessibilityRole="header"
        className="text-headline-emphasized text-foreground"
      >
        {t("arnold.title")}
      </Text>
    );
  }

  return (
    <DropdownMenu
      accessibilityHint={t("arnold.modelMenu.label")}
      accessibilityLabel={t("arnold.modelMenu.titleWithModel", {
        model: model.label,
      })}
      items={models.map((candidate) => ({
        checked: candidate.id === model.id,
        label: candidate.label,
        onPress: () => setSelectedId(candidate.id),
      }))}
      testID="arnold-title"
    >
      <View className="items-center">
        <Text className="text-headline-emphasized text-foreground">
          {t("arnold.title")}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-footnote text-muted-foreground">
            {model.label}
          </Text>
          <SymbolImage
            className="text-caption-2-emphasized text-muted-foreground"
            name="chevron.down"
          />
        </View>
      </View>
    </DropdownMenu>
  );
};
