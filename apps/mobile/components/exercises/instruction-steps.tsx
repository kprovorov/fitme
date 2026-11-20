import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { keyedRows } from "~/components/exercises/keyed-rows";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";

/**
 * An Exercise's steps in its guide, under their heading: numbered in order,
 * the number in Mono in `primary` in its own column (Figma's
 * `ExerciseListItem` type=step, FIT-737). No steps render nothing, heading
 * included, so the Screen keeps its own spacing.
 */
export const InstructionSteps = ({ steps }: { steps: readonly string[] }) => {
  const { t } = useTranslation();

  if (steps.length === 0) {
    return null;
  }

  return (
    <View className="gap-sm" testID="instruction-steps">
      <H4>{t("exercise.steps")}</H4>
      {keyedRows(steps).map(({ key, number, text }) => (
        <View
          // One VoiceOver stop per step, its number read with it.
          accessibilityLabel={t("exercise.spoken.step", { number, step: text })}
          accessible
          className="flex-row gap-3"
          key={key}
          testID="instruction-step"
        >
          {/* Grows with Dynamic Type, so a large number never touches its step. */}
          <Text className="text-mono-body-semibold text-primary min-w-6">
            {number}
          </Text>
          <Text className="flex-1">{text}</Text>
        </View>
      ))}
    </View>
  );
};
