import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { VStack } from "~/components/ui/vstack";
import RegisterView from "~/components/views/register-view";
import Sign from "~/components/brand/sign";

export default function RegisterScreen() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      "keyboardWillShow",
      handleKeyboardShow,
    );
    const hideSubscription = Keyboard.addListener(
      "keyboardWillHide",
      handleKeyboardHide,
    );

    return () => {
      showSubscription.remove();
    };
  }, []);

  const handleKeyboardShow = () => {
    setIsKeyboardVisible(true);
  };

  const handleKeyboardHide = () => {
    setIsKeyboardVisible(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Sign Up",
          headerBackTitle: "Sign Up",
          headerShown: false,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <View style={{ flex: 1 }}>
              <VStack className="h-full p-6 gap-8">
                <Sign
                  width={isKeyboardVisible ? 35 : 70}
                  height={isKeyboardVisible ? 35 : 70}
                />
                <RegisterView />
              </VStack>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
