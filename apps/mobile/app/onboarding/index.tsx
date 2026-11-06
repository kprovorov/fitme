import { useUser } from "@clerk/expo";
import { Link, router, Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Sign from "~/components/brand/sign";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H2 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { storage } from "~/lib/mmkv";

const WelcomeScreen = () => {
  const { user } = useUser();
  const { t } = useTranslation();

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
        <View className="flex h-full flex-col items-center justify-center gap-8 p-6">
          <Sign height={100} width={100} />
          <View className="flex flex-col items-center justify-center gap-2">
            <H2>{t("onboarding.welcome.title")}</H2>
            <Text className="text-center">
              {t("onboarding.welcome.description")}
            </Text>
          </View>
          <VStack className="w-full items-stretch">
            <Link asChild href="/onboarding/profile">
              <Button
                className="w-full"
                icon="arrow.right"
                iconPosition="trailing"
                label={t("onboarding.welcome.getStarted")}
              />
            </Link>
            <Button
              className="w-full"
              label={t("onboarding.welcome.skip")}
              onPress={handleSkip}
              variant="ghost"
            />
          </VStack>
        </View>
      </SafeAreaView>
    </>
  );
};

export default WelcomeScreen;
