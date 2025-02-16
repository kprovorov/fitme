import React from "react";
import { H2 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import ProfileForm from "~/components/forms/profile-form";
import { Platform } from "react-native";
import { Keyboard } from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { TouchableWithoutFeedback } from "react-native";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { useStoreProfileMutation } from "~/hooks/mutations/profiles";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { ChevronLeft } from "~/lib/icons/ChevronLeft";
import { useCurrentUserQuery } from "~/hooks/queries/auth";

export default function ProfileScreen() {
  const { mutateAsync: storeProfile } = useStoreProfileMutation({
    onSuccess: () => {
      router.push("/onboarding/plan");
    },
  });

  const { data: user } = useCurrentUserQuery();

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={50}
          className="flex-1"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView centerContent>
              <VStack className="h-full p-6 items-center justify-center gap-4">
                <VStack className="gap-2">
                  <H2>Let's get to know you!</H2>
                  <Text className="text-center">
                    We'll use this information to personalize your experience.
                  </Text>
                </VStack>
                <ProfileForm
                  onSubmit={async (values) => {
                    await storeProfile(values);
                  }}
                  defaultValues={user?.profile}
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onPress={() => router.back()}
                >
                  <HStack className="gap-1">
                    <ChevronLeft size={16} className="text-white" />
                    <Text>Back</Text>
                  </HStack>
                </Button>
              </VStack>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
