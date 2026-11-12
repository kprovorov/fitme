import { View } from "react-native";

import { Text } from "~/components/ui/text";
import { instructionSteps } from "~/lib/instruction-steps";

/**
 * An Exercise's instructions as numbered steps, the Library's markdown list
 * markers gone (`lib/instruction-steps.ts`). Shared by the Exercise detail
 * screen and its guide. No instructions render nothing, so the Screen keeps
 * its own spacing.
 */
export const InstructionSteps = ({
  instructions,
}: {
  instructions: string | null | undefined;
}) => {
  const steps = instructions ? instructionSteps(instructions) : [];

  if (steps.length === 0) {
    return null;
  }

  // A step can repeat ("Repeat."), so its key counts the times it came before.
  const seen = new Map<string, number>();

  const rows = steps.map((step, index) => {
    const repeat = seen.get(step) ?? 0;
    seen.set(step, repeat + 1);

    return { key: `${step}#${repeat}`, number: index + 1, step };
  });

  return (
    <View className="gap-sm" testID="instruction-steps">
      {rows.map(({ key, number, step }) => (
        <View
          // One VoiceOver stop per step, its number read with it.
          accessibilityLabel={`${number}. ${step}`}
          accessible
          className="flex-row gap-3"
          key={key}
          testID="instruction-step"
        >
          {/* Grows with Dynamic Type, so a large number never touches its step. */}
          <Text className="text-muted-foreground min-w-6">{number}</Text>
          <Text className="flex-1">{step}</Text>
        </View>
      ))}
    </View>
  );
};
