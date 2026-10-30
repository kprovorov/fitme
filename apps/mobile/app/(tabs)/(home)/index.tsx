import { useUser } from "@clerk/expo";
import type { Plan } from "@fitme/core";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import Purchases from "react-native-purchases";
import Logo from "~/components/brand/logo";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { usePlansQuery } from "~/hooks/queries/plans";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useOpenWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { storage } from "~/lib/mmkv";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

import HomeView from "~/components/views/home-view";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { data: profile } = useProfileQuery();
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: plans,
    refetch: refetchWorkoutPlans,
    isError: isPlansError,
    isLoading: isLoadingPlans,
  } = usePlansQuery({
    refetchInterval: 1000 * 60, // 1 minute
  });
  // Read alongside the Plans, so the Next card's Start shows blocked from the
  // first frame while another Workout is in progress.
  const { refetch: refetchOpenSession } = useOpenWorkoutSessionQuery();

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!IS_E2E) {
      await Purchases.invalidateCustomerInfoCache();
    }
    await Promise.all([refetchWorkoutPlans(), refetchOpenSession()]);
    setRefreshing(false);
  }, [refetchWorkoutPlans, refetchOpenSession]);

  const router = useRouter();

  useEffect(() => {
    // `null` means the Profile loaded and there is none; `undefined` means it
    // has not loaded (or failed), so do not send the User to onboarding yet.
    if (user && profile === null) {
      const hasSeen = storage.getBoolean(`onboarding.seen.${user.id}`) ?? false;
      if (!hasSeen) {
        router.push("/onboarding");
      }
    }
  }, [profile, user, router]);

  const handleCreatePlan = useCallback(() => router.push("/planner"), [router]);
  const handleManagePlans = useCallback(() => router.push("/plans"), [router]);
  const openProfile = useCallback(() => router.push("/profile"), [router]);
  const retryPlans = useCallback(() => {
    refetchWorkoutPlans();
  }, [refetchWorkoutPlans]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          // Android's native stack has no header items, so Profile is a text
          // button there; iOS shows the items below and ignores this.
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={openProfile}
                  >
                    <Text className="text-body-emphasized text-primary">
                      {t("profile.title")}
                    </Text>
                  </Pressable>
                )
              : undefined,
          // The Fitme logo in the title's place; `title` still names the tab
          // for the back button of the screens pushed over it.
          headerTitle: () => (
            <View
              accessibilityLabel={t("home.logo")}
              accessibilityRole="image"
              accessible
            >
              <Logo />
            </View>
          ),
          headerTransparent: true,
          title: t("tabs.workout"),
          unstable_headerRightItems: () => [
            {
              accessibilityLabel: t("profile.title"),
              icon: {
                name: "person.fill",
                type: "sfSymbol",
              },
              label: t("profile.title"),
              onPress: openProfile,
              type: "button",
            },
          ],
        }}
      />
      <ScrollView
        contentContainerClassName="grow px-md pb-md"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        showsVerticalScrollIndicator={false}
      >
        {activePlan ? (
          <HomeView plan={activePlan} />
        ) : // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive, Biome resolves react-query-kit's initialData overload, where isLoading is always false
        isLoadingPlans ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator
              colorClassName="accent-foreground"
              size="large"
            />
          </View>
        ) : isPlansError && !plans ? (
          <VStack className="flex-1 py-md">
            <H1 className="text-center">{t("home.loadError.title")}</H1>
            <Text className="text-center">{t("home.loadError.message")}</Text>
            <Button
              className="w-full"
              label={t("common.tryAgain")}
              onPress={retryPlans}
            />
          </VStack>
        ) : (
          <VStack className="flex-1 py-md">
            <H1 className="text-center">{t("home.empty.title")}</H1>
            <Text className="text-center">
              {plans && plans.length > 0
                ? t("home.empty.inactiveMessage")
                : t("home.empty.message")}
            </Text>
            <Button
              className="w-full"
              label={t("home.empty.action")}
              onPress={handleCreatePlan}
            />
            {/* The Plan menu sits above the active Plan's Workouts, so with
                Plans but none active this is the way to the Plans list. */}
            {plans && plans.length > 0 ? (
              <Button
                className="w-full"
                label={t("home.managePlans")}
                onPress={handleManagePlans}
                variant="secondary"
              />
            ) : null}
          </VStack>
        )}
      </ScrollView>
    </>
  );
}
