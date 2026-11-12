import { useHeaderHeight } from "expo-router/react-navigation";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Keyboard,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import type { LayoutChangeEvent } from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView as NativeKeyboardStickyView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const KeyboardStickyView = withUniwind(NativeKeyboardStickyView);
const handleDismissKeyboard = () => Keyboard.dismiss();

/**
 * The sticky action bar's height before it has laid out: `py-sm` around a
 * `lg` Button (16 + 50 + 16). An error message above the Button makes it
 * taller, which `onLayout` then measures.
 */
const STICKY_ACTION_HEIGHT = 82;

/**
 * The gap asked for between the focused field and the sticky action above
 * the keyboard (`sm`). The scroll view aims at the caret's bottom, which sits
 * a few points above the field's bottom stroke, so this keeps the stroke
 * clear of the Button.
 */
const FOCUSED_FIELD_GAP = 16;

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

export const AuthScreen = ({
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
}) => {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState();
  const sticky = keyboard.isVisible;
  const [stickyHeight, setStickyHeight] = useState(STICKY_ACTION_HEIGHT);

  const handleStickyLayout = (event: LayoutChangeEvent) =>
    setStickyHeight(Math.ceil(event.nativeEvent.layout.height));

  return (
    <View className="bg-background flex-1">
      <KeyboardAwareScrollView
        // The focused field scrolls to sit above the sticky action, not
        // under it.
        bottomOffset={stickyHeight + FOCUSED_FIELD_GAP}
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
        extraKeyboardSpace={sticky ? stickyHeight : 0}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableWithoutFeedback
          accessible={false}
          onPress={handleDismissKeyboard}
        >
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
        <KeyboardStickyView className="absolute inset-x-0 bottom-0">
          <View
            className="bg-background px-sm py-sm"
            onLayout={handleStickyLayout}
          >
            {action}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
};
