import type { MuscleGroup } from "@fitme/core";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";
import { useChoiceLabels } from "~/lib/choices";
import { i18n } from "~/lib/i18n";

/**
 * A chip is 22 pt tall (footnote line plus the badge's padding). 11 pt of
 * slop above and below makes the tap 44 pt; 4 pt to each side fills the 8 pt
 * gap between chips without reaching into the next one.
 */
const HIT_SLOP = { bottom: 11, left: 4, right: 4, top: 11 };

function MuscleGroupChip({
  group,
  label,
  onRemove,
}: {
  group: MuscleGroup;
  label: string;
  onRemove: (group: MuscleGroup) => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const remove = useCallback(() => onRemove(group), [group, onRemove]);

  return (
    <Pressable
      accessibilityLabel={t("library.removeMuscleGroup", {
        muscleGroup: label,
      })}
      accessibilityRole="button"
      hitSlop={HIT_SLOP}
      onPress={remove}
    >
      <Badge icon="xmark" iconPosition="trailing">
        <Text>{label}</Text>
      </Badge>
    </Pressable>
  );
}

/**
 * The chosen Muscle groups under the Muscles pill: one lime chip each, in
 * the order given (core's), wrapping onto further lines. × removes that
 * group at once. Nothing chosen renders nothing, so the list keeps the
 * pill's own spacing.
 */
export function MuscleGroupChips({
  groups,
  onRemove,
}: {
  groups: readonly MuscleGroup[];
  onRemove: (group: MuscleGroup) => void;
}) {
  const labels = useChoiceLabels();
  if (groups.length === 0) {
    return null;
  }

  return (
    <View
      className="w-full flex-row flex-wrap items-center gap-xs"
      testID="muscle-group-chips"
    >
      {groups.map((group) => (
        <MuscleGroupChip
          group={group}
          key={group}
          label={labels.muscleGroup(group)}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}
