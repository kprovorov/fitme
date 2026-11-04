/**
 * Stand-in for `~/components/ui/select`, whose SwiftUI `Picker` can't mount
 * under Jest: its label and the chosen option's label as text, and every
 * option as a `radio` named by its label, so a test picks one the way a User
 * would. Use it with
 * `jest.mock("~/components/ui/select", () => jest.requireActual("~/test-utils/select-stub"))`.
 */
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import type { SelectProps } from "~/components/ui/select";

type Value = string | number;

const Option = <TValue extends Value>({
  isChosen,
  label,
  onPick,
  value,
}: {
  isChosen: boolean;
  label: string;
  onPick?: (value: TValue) => void;
  value: TValue;
}) => {
  const pick = useCallback(() => onPick?.(value), [onPick, value]);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected: isChosen }}
      onPress={pick}
    />
  );
};

export const Select = <TValue extends Value>({
  label,
  onValueChange,
  options,
  testID,
  value,
}: SelectProps<TValue>) => {
  const chosen = options.find((option) => option.value === value);
  return (
    <View testID={testID}>
      {label ? <Text>{label}</Text> : null}
      {chosen ? <Text>{chosen.label}</Text> : null}
      {options.map((option) => (
        <Option
          isChosen={option.value === value}
          key={String(option.value)}
          label={option.label}
          onPick={onValueChange}
          value={option.value}
        />
      ))}
    </View>
  );
};
