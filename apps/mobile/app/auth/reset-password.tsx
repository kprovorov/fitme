import { Stack, useLocalSearchParams } from "expo-router";
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
import { Spinner } from "~/components/ui/spinner";
import { P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ResetPasswordView from "~/components/views/reset-password-view";
import { supabase } from "~/lib/supabase";

export default function ResetPasswordScreen() {
  const { token_hash, type } = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
  }>();
  const [verified, setVerified] = useState(!token_hash);
  const [verifyError, setVerifyError] = useState<string>();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (token_hash && type === "recovery") {
      supabase.auth
        .verifyOtp({ token_hash, type: "recovery" })
        .then(({ error }) => {
          if (error) {
            setVerifyError(error.message);
          } else {
            setVerified(true);
          }
        });
    }
  }, [token_hash, type]);

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

  return (
    <>
      <Stack.Screen options={{ title: "Reset Password" }} />

      <View style={{ flex: 1, paddingTop: insets.top }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <VStack className="h-full p-6">
              <Sign
                height={isKeyboardVisible ? 35 : 70}
                width={isKeyboardVisible ? 35 : 70}
              />
              {verifyError ? (
                <P className="text-red-500">{verifyError}</P>
              ) : verified ? (
                <ResetPasswordView />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Spinner className="text-foreground" size={32} />
                </View>
              )}
            </VStack>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}
