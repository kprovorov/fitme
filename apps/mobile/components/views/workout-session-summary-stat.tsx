import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";

interface WorkoutSessionSummaryStatProps {
  icon: SFSymbol;
  /** What VoiceOver reads for the value, when the bare number isn't enough: `3 sets`. */
  spokenValue?: string;
  title: string;
  value: string;
}

const WorkoutSessionSummaryStat = ({
  icon,
  spokenValue,
  title,
  value,
}: WorkoutSessionSummaryStatProps) => {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={t("workoutSummary.statLabel", {
        title,
        value: spokenValue ?? value,
      })}
      accessible
      className="flex flex-col items-start justify-center gap-1"
    >
      <View className="flex flex-row items-center justify-center gap-1">
        <SymbolImage
          className="text-footnote text-muted-foreground"
          name={icon}
        />
        <Text className="text-footnote" variant="muted">
          {title}
        </Text>
      </View>
      <Text className="text-title-1-emphasized">{value}</Text>
    </View>
  );
};

export default WorkoutSessionSummaryStat;
