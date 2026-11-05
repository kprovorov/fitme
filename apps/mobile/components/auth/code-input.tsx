import { useCallback, useState } from "react";
import { View } from "react-native";

import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const NON_DIGITS = /\D/g;
const CELLS = [0, 1, 2, 3, 4, 5];

export function CodeInput({
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
}) {
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
              <Text className="text-title-2-emphasized text-center">
                {value[index] ?? " "}
              </Text>
            )}
          </View>
        ))}
      </View>
      <Input
        accessibilityLabel={label}
        autoComplete="one-time-code"
        autoCorrect={false}
        className="h-full border-0 text-transparent"
        containerClassName="absolute inset-0"
        editable={!disabled}
        keyboardType="number-pad"
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
  );
}
