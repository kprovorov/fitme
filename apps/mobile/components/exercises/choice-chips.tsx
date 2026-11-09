import { Pressable, View } from "react-native";

import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";

/**
 * A chip is 22 pt tall (footnote line plus the badge's padding). 11 pt of
 * slop above and below makes the tap 44 pt; 4 pt to each side fills the 8 pt
 * gap between chips without reaching into the next one.
 */
const HIT_SLOP = { bottom: 11, left: 4, right: 4, top: 11 };

/** One chosen value, as the chip row shows it. */
export interface ChoiceChip {
  /** What VoiceOver reads for the ×, such as "Remove Chest". */
  accessibilityLabel: string;
  /**
   * Its identity in the row, unique across the choices sharing it (a value's
   * own id isn't: `bench` is Equipment, and a Muscle group could be named it).
   */
  id: string;
  /** The value's name in the App language. */
  label: string;
  onRemove: () => void;
}

const Chip = ({ accessibilityLabel, label, onRemove }: ChoiceChip) => (
  <Pressable
    accessibilityLabel={accessibilityLabel}
    accessibilityRole="button"
    hitSlop={HIT_SLOP}
    onPress={onRemove}
  >
    <Badge icon="xmark" iconPosition="trailing">
      <Text>{label}</Text>
    </Badge>
  </Pressable>
);

/**
 * What the Library list is narrowed to, under the pills: one lime chip per
 * chosen value, in the order given (the Muscle groups, then the Equipment,
 * each in core's), wrapping onto further lines as one row. × removes that
 * value at once. Nothing chosen in any of the choices renders nothing, so the
 * list keeps the pills' own spacing.
 */
export const ChoiceChips = ({ chips }: { chips: readonly ChoiceChip[] }) => {
  if (chips.length === 0) {
    return null;
  }

  return (
    <View
      className="gap-xs w-full flex-row flex-wrap items-center"
      testID="choice-chips"
    >
      {chips.map((chip) => (
        <Chip {...chip} key={chip.id} />
      ))}
    </View>
  );
};
