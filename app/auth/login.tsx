import { Stack } from "expo-router";
import React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import LoginView from "~/components/views/login-view";

export default function LoginScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Login",
          headerBackTitle: "Login",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <VStack className="h-full p-4">
                <H1>Login</H1>
                <LoginView />
              </VStack>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
