import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Sign from "~/components/brand/sign";
import { VStack } from "~/components/ui/vstack";
import LoginView from "~/components/views/login-view";

export default function LoginScreen() {
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
  }, [handleKeyboardHide, handleKeyboardShow]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Login",
          headerBackTitle: "Login",
        }}
      />
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View style={{ flex: 1 }}>
            <VStack className="h-full p-6">
              <Sign
                height={isKeyboardVisible ? 35 : 70}
                width={isKeyboardVisible ? 35 : 70}
              />
              <LoginView />
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
