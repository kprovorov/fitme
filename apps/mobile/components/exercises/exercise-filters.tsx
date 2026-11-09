import type { Equipment, MuscleGroup } from "@fitme/core";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ChoiceChips } from "~/components/exercises/choice-chips";
import type { ChoiceChip } from "~/components/exercises/choice-chips";
import { Button } from "~/components/ui/button";
import { VStack } from "~/components/ui/vstack";
import {
  getEquipmentChoice,
  setEquipmentChoice,
} from "~/hooks/equipment-choice";
import { getMuscleChoice, setMuscleChoice } from "~/hooks/muscle-choice";
import { useChoiceLabels } from "~/lib/choices";
// The app's instance, named so it's started wherever this renders.
import { i18n } from "~/lib/i18n";

/**
 * What the Library list is filtered by, above it: the Muscles pill, the
 * Equipment pill when the screen has an Equipment choice, and under them the
 * one chip row of what the list is narrowed to. A pill always reads its own
 * name, whatever is chosen, and opens the shared choice sheet over its list,
 * which hands the confirmed choice back under the screen's key. Each chosen
 * value is a chip — the Muscle groups, then the Equipment, each in core's
 * order — whose × removes it at once.
 */
export const ExerciseFilters = ({
  disabled = false,
  equipment,
  equipmentChoiceKey,
  muscleChoiceKey,
  muscleGroups,
}: {
  /** Neither pill can open its sheet (the picker, while saving). */
  disabled?: boolean;
  /** The screen's confirmed Equipment choice, in core's order. */
  equipment: readonly Equipment[];
  /**
   * Where that choice is kept. Left out, the screen has no Equipment pill and
   * filters by none.
   */
  equipmentChoiceKey?: string;
  /** Where the screen's Muscle group choice is kept. */
  muscleChoiceKey: string;
  /** That choice, in core's order. */
  muscleGroups: readonly MuscleGroup[];
}) => {
  const { t } = useTranslation(undefined, { i18n });
  const router = useRouter();
  const labels = useChoiceLabels();

  const openMuscles = useCallback(() => {
    router.push({
      params: { choice: muscleChoiceKey },
      pathname: "/muscles",
    });
  }, [muscleChoiceKey, router]);

  const openEquipment = useCallback(() => {
    router.push({
      params: { choice: equipmentChoiceKey },
      pathname: "/equipment",
    });
  }, [equipmentChoiceKey, router]);

  const removeMuscleGroup = useCallback(
    (group: MuscleGroup) => {
      setMuscleChoice(
        muscleChoiceKey,
        getMuscleChoice(muscleChoiceKey).filter((chosen) => chosen !== group)
      );
    },
    [muscleChoiceKey]
  );

  const removeEquipment = useCallback(
    (value: Equipment) => {
      // Only a chip removes Equipment, and a screen without the pill has
      // none chosen, so there is always a key by now.
      if (equipmentChoiceKey === undefined) {
        return;
      }

      setEquipmentChoice(
        equipmentChoiceKey,
        getEquipmentChoice(equipmentChoiceKey).filter(
          (chosen) => chosen !== value
        )
      );
    },
    [equipmentChoiceKey]
  );

  // A value's own id isn't unique across the two choices (`bench` is
  // Equipment, and a Muscle group could be named it), so each chip's identity
  // in the row says which choice it came from.
  const chips: ChoiceChip[] = [
    ...muscleGroups.map((group) => ({
      accessibilityLabel: t("library.removeMuscleGroup", {
        muscleGroup: labels.muscleGroup(group),
      }),
      id: `muscle-group-${group}`,
      label: labels.muscleGroup(group),
      onRemove: () => removeMuscleGroup(group),
    })),
    ...equipment.map((value) => ({
      accessibilityLabel: t("library.removeEquipment", {
        equipment: labels.equipment(value),
      }),
      id: `equipment-${value}`,
      label: labels.equipment(value),
      onRemove: () => removeEquipment(value),
    })),
  ];

  return (
    <VStack className="mb-sm items-stretch">
      <View className="gap-xs flex-row items-center self-start">
        <Button
          disabled={disabled}
          fill={false}
          icon="chevron.down"
          iconPosition="trailing"
          label={t("library.muscles")}
          onPress={openMuscles}
          size="sm"
          variant="secondary"
        />
        {equipmentChoiceKey === undefined ? null : (
          <Button
            disabled={disabled}
            fill={false}
            icon="chevron.down"
            iconPosition="trailing"
            label={t("library.equipment")}
            onPress={openEquipment}
            size="sm"
            variant="secondary"
          />
        )}
      </View>
      <ChoiceChips chips={chips} />
    </VStack>
  );
};
