import { useUser } from "@clerk/expo";
import { Link, router, Stack } from "expo-router";
import { useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Sign from "~/components/brand/sign";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H2 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { storage } from "~/lib/mmkv";

export default function WelcomeScreen() {
  const { user } = useUser();

  const handleSkip = useCallback(() => {
    if (user) {
      storage.set(`onboarding.seen.${user.id}`, true);
    }
    router.dismissTo("/");
  }, [user]);

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => null,
        }}
      />
      <SafeAreaView className="flex-1">
        <VStack className="h-full items-center justify-center gap-8 p-6">
          <Sign height={100} width={100} />
          <VStack className="gap-2">
            <H2>Welcome to Fitme!</H2>
            <Text className="text-center">
              Your personal AI trainer is waiting for you. Let's get started!
            </Text>
          </VStack>
          <VStack className="w-full items-stretch">
            <Link asChild href="/onboarding/profile">
              <Button
                className="w-full"
                icon="arrow.right"
                iconPosition="trailing"
                label="Get Started"
              />
            </Link>
            <Button
              className="w-full"
              label="Skip"
              onPress={handleSkip}
              variant="ghost"
            />
          </VStack>
        </VStack>
      </SafeAreaView>
    </>
  );
}
