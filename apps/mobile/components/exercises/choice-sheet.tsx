import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";

const ChoiceRow = <T extends string>({
  checked,
  label,
  onToggle,
  value,
}: {
  checked: boolean;
  label: string;
  onToggle: (value: T) => void;
  value: T;
}) => {
  const handlePress = useCallback(() => onToggle(value), [onToggle, value]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="active:bg-muted flex-row items-center gap-3 py-3"
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
      <Text className="flex-1">{label}</Text>
    </Pressable>
  );
};

/**
 * The choice sheet behind both the Muscles pill and the Equipment pill, over
 * the Library tab or the Exercise picker: every choosable value of one fixed
 * list in core's order, ticked from the opener's choice (`choice`, its key in
 * the list's store). The ticks are a draft: ✓ hands it back to the opener and
 * closes, Reset clears it without applying it, and swiping the sheet away
 * discards it.
 */
export const ChoiceSheet = <T extends string>({
  getChoice,
  label,
  setChoice,
  title,
  values,
}: {
  /** The opener's confirmed choice, by its key. */
  getChoice: (key: string) => readonly T[];
  /** A value's name in the App language. */
  label: (value: T) => string;
  /** Hands the confirmed choice back to the opener. */
  setChoice: (key: string, chosen: readonly T[]) => void;
  title: string;
  /** The choosable values, in core's order. */
  values: readonly T[];
}) => {
  const { t } = useTranslation(undefined, { i18n });
  const router = useRouter();
  const { choice } = useLocalSearchParams<{ choice: string }>();

  const [draft, setDraft] = useState<readonly T[]>(() => getChoice(choice));

  const toggle = useCallback((value: T) => {
    setDraft((current) =>
      current.includes(value)
        ? current.filter((chosen) => chosen !== value)
        : [...current, value]
    );
  }, []);

  const reset = useCallback(() => setDraft([]), []);

  const confirm = useCallback(() => {
    setChoice(choice, draft);
    router.back();
  }, [choice, draft, router, setChoice]);

  const draftSet = new Set(draft);
  const lastIndex = values.length - 1;

  return (
    <>
      <Stack.Screen
        options={{
          title,
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
        {values.map((value, index) => (
          <View key={value}>
            <ChoiceRow
              checked={draftSet.has(value)}
              label={label(value)}
              onToggle={toggle}
              value={value}
            />
            {index === lastIndex ? null : <Separator className="ml-9 w-auto" />}
          </View>
        ))}
      </ScrollView>
    </>
  );
};
