/**
 * Stand-in for `~/components/ui/button`, whose SwiftUI views can't mount
 * under Jest: a Pressable with the button role, its label as text and the
 * native disabled state. Use it with
 * `jest.mock("~/components/ui/button", () => jest.requireActual("~/test-utils/button-stub"))`.
 */
import { Pressable, Text } from "react-native";

interface ButtonProps {
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
  onPress?: () => void;
  testID?: string;
}

export const Button = ({
  disabled,
  isLoading,
  label,
  onPress,
  testID,
}: ButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{
      busy: !!isLoading,
      disabled: !!(disabled || isLoading),
    }}
    disabled={!!(disabled || isLoading)}
    onPress={onPress}
    testID={testID}
  >
    {label ? <Text>{label}</Text> : null}
  </Pressable>
);
