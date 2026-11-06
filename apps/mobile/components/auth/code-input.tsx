import { useCallback, useState } from "react";
import { TextInput, View } from "react-native";

import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const NON_DIGITS = /\D/gu;
const CELLS = [0, 1, 2, 3, 4, 5];

export const CodeInput = ({
  value,
  onChange,
  label,
  disabled,
  error,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  disabled?: boolean;
  error?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  const blur = useCallback(() => setFocused(false), []);
  const focus = useCallback(() => setFocused(true), []);

  const change = useCallback(
    (text: string) => onChange(text.replaceAll(NON_DIGITS, "").slice(0, 6)),
    [onChange]
  );

  return (
    <View className="relative">
      <View
        accessibilityElementsHidden
        className="gap-xs flex-row"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {CELLS.map((index) => (
          <View
            className={cn(
              "border-continuous border-input min-h-14 flex-1 items-center justify-center rounded-lg border px-0.5 py-2",
              error
                ? "border-destructive"
                : focused &&
                    index === Math.min(value.length, 5) &&
                    "border-ring border-2"
            )}
            key={index}
          >
            {focused && !value[index] && index === value.length ? (
              <View className="bg-primary h-6 w-0.5" />
            ) : (
              <Text className="text-center" variant="h3">
                {value[index] ?? " "}
              </Text>
            )}
          </View>
        ))}
      </View>
      <View className="gap-xs absolute inset-0">
        <TextInput
          accessibilityLabel={label}
          autoComplete="one-time-code"
          autoCorrect={false}
          className="border-continuous px-sm text-body h-full min-h-12 rounded-lg border-0 bg-transparent text-transparent"
          editable={!disabled}
          keyboardType="number-pad"
          lineBreakModeIOS="tail"
          onBlur={blur}
          onChangeText={change}
          onFocus={focus}
          placeholder={label}
          placeholderTextColorClassName="accent-transparent"
          selectionColorClassName="accent-transparent"
          testID="verify-code-input"
          textContentType="oneTimeCode"
          value={value}
        />
      </View>
    </View>
  );
};
