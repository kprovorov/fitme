/**
 * Stand-in for `~/components/ui/picker`, whose SwiftUI views can't mount
 * under Jest: each option is a button labelled `<label> <option label>`
 * (`Muscle group Chest`). Use it with
 * `jest.mock("~/components/ui/picker", () => jest.requireActual("~/test-utils/picker-stub"))`.
 */
import { Pressable } from "react-native";

interface PickerOption {
  label: string;
  value: string;
}

interface OptionButtonProps {
  label: string | undefined;
  onValueChange: ((value: string) => void) | undefined;
  option: PickerOption;
}

const OptionButton = ({ label, onValueChange, option }: OptionButtonProps) => {
  const choose = () => onValueChange?.(option.value);
  return (
    <Pressable
      accessibilityLabel={[label, option.label].filter(Boolean).join(" ")}
      accessibilityRole="button"
      onPress={choose}
    />
  );
};

export const Picker = ({
  label,
  onValueChange,
  options,
}: {
  label?: string;
  onValueChange?: (value: string) => void;
  options: PickerOption[];
}) =>
  options.map((option) => (
    <OptionButton
      key={option.value}
      label={label}
      onValueChange={onValueChange}
      option={option}
    />
  ));
