import type { MuscleGroup } from "@fitme/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import {
  choosableMuscleGroups,
  getMuscleChoice,
  setMuscleChoice,
} from "~/hooks/muscle-choice";
import { useChoiceLabels } from "~/lib/choices";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";

function MuscleGroupRow({
  checked,
  group,
  label,
  onToggle,
}: {
  checked: boolean;
  group: MuscleGroup;
  label: string;
  onToggle: (group: MuscleGroup) => void;
}) {
  const handlePress = useCallback(() => onToggle(group), [group, onToggle]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="flex-row items-center gap-3 py-3 active:bg-muted"
      onPress={handlePress}
    >
      <SymbolImage
        className={
          checked
            ? "text-primary text-title-3"
            : "text-muted-foreground text-title-3"
        }
        name={checked ? "checkmark.circle.fill" : "circle"}
      />
      <Text className="flex-1 text-body">{label}</Text>
    </Pressable>
  );
}

/**
 * The Muscles sheet, over the Library tab or the Exercise picker: every
 * choosable Muscle group in core's order, ticked from the opener's choice
 * (`choice`, its key in `hooks/muscle-choice.ts`). The ticks are a draft:
 * ✓ hands it back to the opener and closes, Reset clears it without applying
 * it, and swiping the sheet away discards it.
 */
export default function MusclesSheet() {
  const { t } = useTranslation(undefined, { i18n });
  const labels = useChoiceLabels();
  const router = useRouter();
  const { choice } = useLocalSearchParams<{ choice: string }>();
  const [draft, setDraft] = useState<readonly MuscleGroup[]>(() =>
    getMuscleChoice(choice)
  );

  const toggle = useCallback((group: MuscleGroup) => {
    setDraft((current) =>
      current.includes(group)
        ? current.filter((chosen) => chosen !== group)
        : [...current, group]
    );
  }, []);

  const reset = useCallback(() => setDraft([]), []);

  const confirm = useCallback(() => {
    setMuscleChoice(choice, draft);
    router.back();
  }, [choice, draft, router]);

  const lastIndex = choosableMuscleGroups.length - 1;

  return (
    <>
      <Stack.Screen
        options={{
          title: t("library.muscles"),
          unstable_headerLeftItems: () => [
            {
              label: t("library.reset"),
              onPress: reset,
              type: "button",
            },
          ],
          unstable_headerRightItems: () => [
            {
              accessibilityLabel: t("library.confirm"),
              icon: { name: "checkmark", type: "sfSymbol" },
              label: t("library.confirm"),
              onPress: confirm,
              type: "button",
              variant: "prominent",
            },
          ],
        }}
      />
      <ScrollView
        contentContainerClassName="px-md pb-md"
        contentInsetAdjustmentBehavior="automatic"
      >
        {choosableMuscleGroups.map((group, index) => (
          <View key={group}>
            <MuscleGroupRow
              checked={draft.includes(group)}
              group={group}
              label={labels.muscleGroup(group)}
              onToggle={toggle}
            />
            {index === lastIndex ? null : <Separator className="ml-9 w-auto" />}
          </View>
        ))}
      </ScrollView>
    </>
  );
}
