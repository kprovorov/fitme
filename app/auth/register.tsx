import { Stack } from "expo-router";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { H1, H3, H4, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import RegisterView from "~/components/views/register-view";

export default function LoginModal() {
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
