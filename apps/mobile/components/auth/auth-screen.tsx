import { useHeaderHeight } from "expo-router/react-navigation";
import type { ReactElement, ReactNode } from "react";
import {
  Keyboard,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface AuthFormParts {
  action: ReactElement;
  fields: ReactNode;
}

export interface AuthFormLayout {
  children: (parts: AuthFormParts) => ReactNode;
  disabled?: boolean;
  onEdit?: () => void;
}

/**
 * Each auth Screen's rhythm, as Figma spaces it: `md` (24) on the welcome,
 * log in and sign up Screens, `lg` (32) on the single-field ones (verify
 * code, forgot and reset password), from the header down and between the
 * header, the form and the actions.
 */
const SPACING = {
  lg: { className: "grow items-stretch gap-lg", top: 32 },
  md: { className: "grow items-stretch gap-md", top: 24 },
} as const;

export function AuthScreen({
  action,
  children,
  footer,
  bottomAction = true,
  spacing = "md",
  welcome = false,
}: {
  action: ReactElement;
  children: ReactNode;
  footer?: ReactNode;
  bottomAction?: boolean;
  spacing?: keyof typeof SPACING;
  welcome?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState();
  const sticky = keyboard.isVisible === true;

  return (
    <View className="bg-background flex-1">
      <KeyboardAwareScrollView
        bottomOffset={82}
        className="flex-1"
        contentContainerClassName="items-stretch gap-md px-sm"
        contentContainerStyle={{
          minHeight: Math.max(
            0,
            height - (welcome ? 0 : headerHeight + insets.bottom)
          ),
          // Figma ends the actions right at the home indicator.
          paddingBottom: welcome ? insets.bottom : 0,
          paddingTop: welcome ? insets.top + 32 : SPACING[spacing].top,
        }}
        contentInsetAdjustmentBehavior={welcome ? "never" : "automatic"}
        extraKeyboardSpace={sticky ? 82 : 0}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <View className={SPACING[spacing].className}>
            {children}
            {bottomAction ? <View className="grow" /> : null}
            <View className="gap-xs">
              {sticky ? null : <View>{action}</View>}
              {footer}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAwareScrollView>
      {sticky ? (
        <KeyboardStickyView
          style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}
        >
          <View className="bg-background px-sm py-sm">{action}</View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}
