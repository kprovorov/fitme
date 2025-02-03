import { Stack } from "expo-router";
import React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { H1, H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import RegisterView from "~/components/views/register-view";

export default function RegisterScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Register",
          headerBackTitle: "Register",
          headerShown: false,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <VStack className="h-full p-4 gap-8">
                <VStack className="gap-0">
                  <H1>Welcome to Fitme!</H1>
                  <H4>Create an account to get started</H4>
                </VStack>
                <RegisterView />
              </VStack>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
