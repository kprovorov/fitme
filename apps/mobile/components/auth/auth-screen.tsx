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

export function AuthScreen({
  action,
  children,
  footer,
  bottomAction = true,
  welcome = false,
}: {
  action: ReactElement;
  children: ReactNode;
  footer?: ReactNode;
  bottomAction?: boolean;
  welcome?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardState();
  const sticky = keyboard.isVisible === true;
  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={82}
        className="flex-1"
        contentContainerClassName="items-stretch gap-md px-sm"
        contentContainerStyle={{
          minHeight: Math.max(
            0,
            height - (welcome ? 0 : headerHeight + insets.bottom)
          ),
          paddingBottom: welcome ? insets.bottom + 8 : 8,
          paddingTop: welcome ? insets.top + 32 : 24,
        }}
        contentInsetAdjustmentBehavior={welcome ? "never" : "automatic"}
        extraKeyboardSpace={sticky ? 82 : 0}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <View className="grow items-stretch gap-md">
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
