/**
 * Stand-in for `~/components/ui/button`, whose SwiftUI views can't mount
 * under Jest: a Pressable with the button role, its label as text and the
 * native disabled state. Use it with
 * `jest.mock("~/components/ui/button", () => jest.requireActual("~/test-utils/button-stub"))`.
 */
import { Pressable, Text } from "react-native";

interface ButtonProps {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  onPress?: () => void;
  testID?: string;
}

export const Button = ({
  accessibilityHint,
  accessibilityLabel,
  disabled,
  isLoading,
  label,
  loadingLabel,
  onPress,
  testID,
}: ButtonProps) => {
  const shown = isLoading && loadingLabel ? loadingLabel : label;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        busy: !!isLoading,
        disabled: !!(disabled || isLoading),
      }}
      disabled={!!(disabled || isLoading)}
      onPress={onPress}
      testID={testID}
    >
      {shown ? <Text>{shown}</Text> : null}
    </Pressable>
  );
};
