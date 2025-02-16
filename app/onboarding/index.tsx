import React from "react";
import { H1, H2 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import Sign from "~/components/brand/sign";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Link } from "expo-router";

export default function WelcomeScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        <VStack className="h-full p-6 items-center justify-center gap-8">
          <Sign width={100} height={100} />
          <VStack className="gap-2">
            <H2>Welcome to Fitme!</H2>
            <Text className="text-center">
              Your personal AI trainer is waiting for you. Let's get started!
            </Text>
          </VStack>
          <Link href="/onboarding/profile" asChild>
            <Button className="w-full">
              <HStack className="gap-2">
                <Text>Get Started</Text>
                <ArrowRight size={16} className="text-black" />
              </HStack>
            </Button>
          </Link>
        </VStack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
