import { type Gender, genders, getGenderLabel } from "@fitme/core";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

interface GenderSwitchProps {
  className?: string;
  disabled?: boolean;
  onValueChange?: (value: Gender) => void;
  testID?: string;
  value?: Gender;
}

interface GenderOptionProps {
  disabled?: boolean;
  gender: Gender;
  isSelected: boolean;
  onValueChange?: (value: Gender) => void;
}

function GenderOption({
  disabled,
  gender,
  isSelected,
  onValueChange,
}: GenderOptionProps) {
  const handlePress = useCallback(
    () => onValueChange?.(gender),
    [gender, onValueChange]
  );

  return (
    <Pressable
      accessibilityLabel={getGenderLabel(gender)}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, disabled }}
      className={cn(
        "flex-1 flex-row items-center justify-start gap-2 rounded-lg border-2 bg-card p-4",
        isSelected && "border-primary",
        disabled && "opacity-50"
      )}
      disabled={disabled}
      onPress={handlePress}
    >
      <View
        className={cn(
          "aspect-square h-5 w-5 items-center justify-center rounded-full border-2 border-primary",
          disabled && "border-muted"
        )}
      >
        {isSelected ? (
          <View className="aspect-square h-[10px] w-[10px] rounded-full bg-primary" />
        ) : null}
      </View>
      <Text>{getGenderLabel(gender)}</Text>
    </Pressable>
  );
}

/**
 * Side-by-side gender cards. Deliberately not a SwiftUI segmented `Picker` —
 * the onboarding form wants the same bordered card treatment the rest of the
 * step uses, and a segmented control can't carry it.
 */
const GenderSwitch = ({
  value,
  onValueChange,
  disabled,
  className,
  testID,
}: GenderSwitchProps) => (
  <HStack
    accessibilityRole="radiogroup"
    className={cn("items-stretch justify-stretch gap-4", className)}
    testID={testID}
  >
    {genders.map((gender) => (
      <GenderOption
        disabled={disabled}
        gender={gender}
        isSelected={value === gender}
        key={gender}
        onValueChange={onValueChange}
      />
    ))}
  </HStack>
);

GenderSwitch.displayName = "GenderSwitch";

export type { GenderSwitchProps };
export { GenderSwitch };
