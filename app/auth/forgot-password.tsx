import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Sign from "~/components/brand/sign";
import { VStack } from "~/components/ui/vstack";
import ForgotPasswordView from "~/components/views/forgot-password-view";

export default function ForgotPasswordScreen() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardWillShow", () =>
      setIsKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener("keyboardWillHide", () =>
      setIsKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: "Forgot Password" }} />
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <VStack className="h-full p-6">
              <Sign
                height={isKeyboardVisible ? 35 : 70}
                width={isKeyboardVisible ? 35 : 70}
              />
              <ForgotPasswordView />
            </VStack>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
