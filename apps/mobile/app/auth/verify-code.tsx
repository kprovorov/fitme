import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Sign from "~/components/brand/sign";
import { VStack } from "~/components/ui/vstack";
import VerifyCodeView, {
  isCodePurpose,
} from "~/components/views/verify-code-view";

/** Enters an emailed code; `purpose` says which Clerk flow it completes. */
export default function VerifyCodeScreen() {
  const { purpose } = useLocalSearchParams<{ purpose: string }>();
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

  const insets = useSafeAreaInsets();

  if (!isCodePurpose(purpose)) {
    return <Redirect href="/auth/register" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: "Verify Code" }} />

      <View style={{ flex: 1, paddingTop: insets.top }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {/* Tap-outside-to-dismiss only; keep the fields individually accessible */}
          <TouchableWithoutFeedback
            accessible={false}
            onPress={Keyboard.dismiss}
          >
            <VStack className="h-full p-6">
              <Sign
                height={isKeyboardVisible ? 35 : 70}
                width={isKeyboardVisible ? 35 : 70}
              />
              <VerifyCodeView key={purpose} purpose={purpose} />
            </VStack>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}
