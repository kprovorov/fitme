import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Sign from "~/components/brand/sign";
import { VStack } from "~/components/ui/vstack";
import RegisterView from "~/components/views/register-view";

export default function RegisterScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const handleKeyboardShow = useCallback(() => {
    setIsKeyboardVisible(true);
  }, []);

  const handleKeyboardHide = useCallback(() => {
    setIsKeyboardVisible(false);
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      "keyboardWillShow",
      handleKeyboardShow
    );
    const _hideSubscription = Keyboard.addListener(
      "keyboardWillHide",
      handleKeyboardHide
    );

    return () => {
      showSubscription.remove();
    };
  }, [handleKeyboardShow, handleKeyboardHide]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t("auth.register.title"),
        }}
      />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <VStack className="h-full gap-8 p-6">
            <Sign
              height={isKeyboardVisible ? 35 : 70}
              width={isKeyboardVisible ? 35 : 70}
            />
            <RegisterView />
          </VStack>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}
