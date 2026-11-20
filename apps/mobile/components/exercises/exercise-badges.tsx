import type { Difficulty, Equipment, MovementPattern } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";
import { useChoiceLabels } from "~/lib/choices";

interface ExerciseBadgesProps {
  difficulty: Difficulty;
  equipment: readonly Equipment[];
  movementPatterns: readonly MovementPattern[];
}

interface ShownBadge {
  icon: SFSymbol;
  key: string;
  label: string;
  spoken: string;
  testID: string;
}

// i18next reads these inside a key as nesting and namespace separators.
const KEY_SEPARATORS = /[.:]/u;

/**
 * The Exercise detail's badges under its name, in one row that wraps: the
 * Equipment it needs (in the order the Library answers, core's), its
 * Difficulty, then its movement patterns, each `secondary` with its kind's SF
 * Symbol (Figma's `Badge / Symbol`, FIT-737). Every label is in the App
 * language; an id this build doesn't know (an offline copy keeps the lists as
 * plain strings) shows as itself. VoiceOver reads each badge with its kind
 * ("Equipment: Dumbbell").
 */
export const ExerciseBadges = ({
  difficulty,
  equipment,
  movementPatterns,
}: ExerciseBadgesProps) => {
  const { t } = useTranslation();
  const labels = useChoiceLabels();

  // SAFETY: the key is a fixed section, separator-containing ids are shown as
  // themselves, and defaultValue covers an id absent from the typed catalogs.
  const difficultyLabel = KEY_SEPARATORS.test(difficulty)
    ? difficulty
    : t(`exercise.difficulty.${difficulty}` as never, {
        defaultValue: difficulty,
      });

  const badges: ShownBadge[] = [
    ...equipment.map((item) => {
      const label = labels.equipment(item);

      return {
        icon: "dumbbell.fill" as const,
        key: `equipment:${item}`,
        label,
        spoken: t("exercise.spoken.equipment", { equipment: label }),
        testID: "equipment-badge",
      };
    }),
    // A copy kept on the device can carry a blank one, which says nothing.
    ...(difficulty.trim()
      ? [
          {
            icon: "chart.bar.fill" as const,
            key: `difficulty:${difficulty}`,
            label: difficultyLabel,
            spoken: t("exercise.spoken.difficulty", {
              difficulty: difficultyLabel,
            }),
            testID: "difficulty-badge",
          },
        ]
      : []),
    ...movementPatterns.map((pattern) => {
      const label = labels.movementPattern(pattern);

      return {
        icon: "arrow.up.and.down" as const,
        key: `movement:${pattern}`,
        label,
        spoken: t("exercise.spoken.movementPattern", {
          movementPattern: label,
        }),
        testID: "movement-pattern-badge",
      };
    }),
  ];

  return (
    <View
      className="gap-xs flex-row flex-wrap items-center"
      testID="exercise-badges"
    >
      {badges.map(({ icon, key, label, spoken, testID }) => (
        <Badge
          accessibilityLabel={spoken}
          accessible
          icon={icon}
          key={key}
          testID={testID}
          variant="secondary"
        >
          <Text>{label}</Text>
        </Badge>
      ))}
    </View>
  );
};
