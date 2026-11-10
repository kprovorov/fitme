import { useUser } from "@clerk/expo";
import { rateLimitedFor } from "@fitme/api-client";
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
import HomeView from "~/components/views/home-view";
import {
  useActivePlanQuery,
  usePlanSummariesQuery,
} from "~/hooks/queries/plans";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useOpenWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { storage } from "~/lib/mmkv";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

/** How often the tab reads its Plans again while it's open: every minute. */
const REFRESH_INTERVAL_MS = 60_000;

const HomeProfileButton = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const openProfile = useCallback(() => router.push("/profile"), [router]);

  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={openProfile}>
      <Text className="text-primary" variant="large">
        {t("profile.title")}
      </Text>
    </Pressable>
  );
};

const HomeHeaderTitle = () => {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={t("home.logo")}
      accessibilityRole="image"
      accessible
    >
      <Logo />
    </View>
  );
};

const HomeScreen = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { data: profile } = useProfileQuery();
  const [refreshing, setRefreshing] = useState(false);

  // Two reads in parallel, each refreshed every minute: the active Plan in
  // full for its Workout cards, and the Plans' summaries for whether the User
  // has any Plan at all (the empty state's text and Manage Plans).
  const {
    data: activePlan,
    error: activePlanError,
    isError: isActivePlanError,
    refetch: refetchActivePlan,
  } = useActivePlanQuery({ refetchInterval: REFRESH_INTERVAL_MS });

  const {
    data: plans,
    error: plansError,
    isError: isPlansError,
    refetch: refetchPlans,
  } = usePlanSummariesQuery({ refetchInterval: REFRESH_INTERVAL_MS });

  // Read alongside the Plans, so the Next card's Start shows blocked from the
  // first frame while another Workout is in progress.
  const { refetch: refetchOpenSession } = useOpenWorkoutSessionQuery();

  const refetchPlanReads = useCallback(
    () => Promise.all([refetchActivePlan(), refetchPlans()]),
    [refetchActivePlan, refetchPlans]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      if (!IS_E2E) {
        await Purchases.invalidateCustomerInfoCache();
      }

      await Promise.all([refetchPlanReads(), refetchOpenSession()]);
    } catch (error) {
      setRefreshing(false);
      throw error;
    }

    setRefreshing(false);
  }, [refetchPlanReads, refetchOpenSession]);

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

  const handleCreatePlan = useCallback(
    () => router.push("/plans/create"),
    [router]
  );

  const handleManagePlans = useCallback(() => router.push("/plans"), [router]);
  const openProfile = useCallback(() => router.push("/profile"), [router]);

  const retryPlans = useCallback(() => {
    void refetchPlanReads();
  }, [refetchPlanReads]);

  // What the tab shows, from what has been read: a failed refresh keeps the
  // last answer. The active Plan's cards need only its read; without one the
  // empty state needs the summaries too, to say whether any Plan exists.
  const activePlanFailed = isActivePlanError && activePlan === undefined;
  const plansFailed = activePlan === null && isPlansError && !plans;

  // A Public API read refused for its rate limit gives the wait.
  const waitSeconds =
    (activePlanFailed ? rateLimitedFor(activePlanError) : null) ??
    (plansFailed ? rateLimitedFor(plansError) : null);

  const renderContent = () => {
    if (activePlan) {
      return <HomeView plan={activePlan} />;
    }

    if (activePlanFailed || plansFailed) {
      return (
        <VStack className="my-md flex-1">
          <H1 className="text-center">{t("home.loadError.title")}</H1>
          <Text className="text-center">
            {waitSeconds === null
              ? t("home.loadError.message")
              : t("common.rateLimited", { seconds: waitSeconds })}
          </Text>
          <Button
            className="w-full"
            label={t("common.tryAgain")}
            onPress={retryPlans}
            size="lg"
          />
        </VStack>
      );
    }

    if (activePlan === undefined || !plans) {
      return (
        <View
          className="flex-1 items-center justify-center"
          testID="home-loading"
        >
          <ActivityIndicator colorClassName="accent-foreground" size="large" />
        </View>
      );
    }

    return (
      <VStack className="my-md flex-1">
        <H1 className="text-center">{t("home.empty.title")}</H1>
        <Text className="text-center">
          {plans.length > 0
            ? t("home.empty.inactiveMessage")
            : t("home.empty.message")}
        </Text>
        <Button
          className="w-full"
          label={t("home.empty.action")}
          onPress={handleCreatePlan}
          size="lg"
        />
        {/* The Plan menu sits above the active Plan's Workouts, so with
            Plans but none active this is the way to the Plans list. */}
        {plans.length > 0 ? (
          <Button
            className="w-full"
            label={t("home.managePlans")}
            onPress={handleManagePlans}
            size="lg"
            variant="secondary"
          />
        ) : null}
      </VStack>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          // Android's native stack has no header items, so Profile is a text
          // button there; iOS shows the items below and ignores this.
          headerRight:
            Platform.OS === "android" ? HomeProfileButton : undefined,
          // The Fitme logo in the title's place; `title` still names the tab
          // for the back button of the screens pushed over it.
          headerTitle: HomeHeaderTitle,
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
        contentContainerClassName="grow px-sm pt-2.5 pb-md"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        showsVerticalScrollIndicator={false}
        testID="home-screen"
      >
        {renderContent()}
      </ScrollView>
    </>
  );
};

export default HomeScreen;
