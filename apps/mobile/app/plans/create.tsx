import {
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MIN_FREQUENCY,
} from "@fitme/core";
import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import RevenueCatUI from "react-native-purchases-ui";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "~/components/symbol-image";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useIsProQuery } from "~/hooks/revenueCat";
import { isPlanNumberIn, NEW_PLAN_ID, wholePlanNumber } from "~/lib/plan-draft";

/** How often a new Plan trains a week until the User says otherwise. */
const DEFAULT_FREQUENCY = 3;

/**
 * One way of getting a Plan: its name, what it does, and the Pro badge for a
 * way that needs a subscription.
 */
const ChoiceTile = ({
  badge,
  hint,
  icon,
  label,
  onPress,
}: {
  badge?: string;
  hint: string;
  icon: SFSymbol;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="button"
    className="border-continuous bg-card rounded-card flex-row items-center gap-3 p-4 active:opacity-80"
    onPress={onPress}
  >
    {/* One width for every icon, so each tile's text starts at the same x
        whichever symbol it has (FIT-637). */}
    <View className="w-8 shrink-0 items-center">
      <SymbolImage className="text-primary text-title-2" name={icon} />
    </View>
    <View className="flex-1 flex-col items-start justify-center gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="large">{label}</Text>
        {badge ? (
          <Badge variant="secondary">
            <Text>{badge}</Text>
          </Badge>
        ) : null}
      </View>
      <Text variant="muted">{hint}</Text>
    </View>
    <SymbolImage
      className="text-body text-muted-foreground shrink-0"
      name="chevron.right"
    />
  </Pressable>
);

/**
 * Where every "Create Plan" leads: build the Plan by hand, free for every
 * User, or ask Arnold, which needs Pro and shows the paywall without it.
 *
 * Building asks only for a name and how often the User trains, then replaces
 * this Screen with the Plan editor on a new draft of that many empty,
 * lettered Workouts; everything else is theirs to fill in later or leave
 * unset (ADR 0017).
 */
const CreatePlanScreen = () => {
  const router = useRouter();
  const { t } = useTranslation();

  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState("");

  const [frequencyText, setFrequencyText] = useState(String(DEFAULT_FREQUENCY));

  // A read still in flight counts as not Pro, so Ask Arnold never sends a
  // free User to the planner it would refuse them.
  const { data: isPro } = useIsProQuery();

  const buildByHand = useCallback(() => setIsNaming(true), []);
  const backToChoice = useCallback(() => setIsNaming(false), []);
  const cancel = useCallback(() => router.back(), [router]);

  const askArnold = useCallback(() => {
    if (isPro) {
      router.replace("/planner");

      return;
    }

    void RevenueCatUI.presentPaywall();
  }, [isPro, router]);

  const trimmedName = name.trim();
  const frequency = wholePlanNumber(frequencyText);

  let nameError: string | undefined;

  if (trimmedName.length > MAX_PLAN_NAME_LENGTH) {
    nameError = t("planEditor.errors.nameTooLong", {
      max: MAX_PLAN_NAME_LENGTH,
    });
  }

  const frequencyError = isPlanNumberIn(frequency, MIN_FREQUENCY, MAX_FREQUENCY)
    ? undefined
    : t("planEditor.errors.frequencyRange", {
        max: MAX_FREQUENCY,
        min: MIN_FREQUENCY,
      });

  const canContinue =
    trimmedName !== "" &&
    nameError === undefined &&
    frequencyError === undefined;

  const start = useCallback(() => {
    if (
      !(canContinue && isPlanNumberIn(frequency, MIN_FREQUENCY, MAX_FREQUENCY))
    ) {
      return;
    }

    // Replaced, not pushed: this Screen has done its job, so closing the
    // editor goes back where Create Plan was tapped.
    router.replace({
      params: {
        frequency: String(frequency),
        name: trimmedName,
        planId: NEW_PLAN_ID,
      },
      pathname: "/plans/[planId]/edit",
    });
  }, [canContinue, frequency, router, trimmedName]);

  const leftItems = useMemo(
    () => () => [
      isNaming
        ? {
            label: t("planBuilder.back"),
            onPress: backToChoice,
            type: "button" as const,
          }
        : {
            label: t("common.cancel"),
            onPress: cancel,
            type: "button" as const,
          },
    ],
    [backToChoice, cancel, isNaming, t]
  );

  const rightItems = useMemo(
    () => () => [
      {
        disabled: !canContinue,
        label: t("planBuilder.continue"),
        onPress: start,
        type: "button" as const,
        variant: "prominent" as const,
      },
    ],
    [canContinue, start, t]
  );

  return (
    <>
      <Stack.Screen
        // headerShown and headerTransparent are the root layout's: changing
        // them from here remounts this modal's content (FIT-628).
        options={{
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: isNaming
            ? t("planBuilder.detailsTitle")
            : t("planBuilder.title"),
          unstable_headerLeftItems: leftItems,
          unstable_headerRightItems: isNaming ? rightItems : undefined,
        }}
      />

      <KeyboardAwareScrollView
        bottomOffset={24}
        className="flex-1"
        contentContainerClassName="gap-md p-md pb-lg"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        testID="create-plan"
      >
        {isNaming ? (
          <VStack className="items-stretch">
            <Text variant="muted">{t("planBuilder.detailsHint")}</Text>
            <View className="flex flex-col items-stretch justify-center gap-2">
              <Label>{t("planEditor.name")}</Label>
              <Input
                autoFocus
                error={nameError}
                onChangeText={setName}
                placeholder={t("planEditor.namePlaceholder")}
                testID="new-plan-name"
                value={name}
              />
            </View>
            <View className="flex flex-col items-stretch justify-center gap-2">
              <Label>{t("planEditor.frequency")}</Label>
              <Input
                error={frequencyError}
                keyboardType="number-pad"
                onChangeText={setFrequencyText}
                testID="new-plan-frequency"
                value={frequencyText}
              />
            </View>
          </VStack>
        ) : (
          <VStack className="items-stretch">
            <H4>{t("planBuilder.question")}</H4>
            <ChoiceTile
              hint={t("planBuilder.byHandHint")}
              icon="hammer"
              label={t("planBuilder.byHand")}
              onPress={buildByHand}
            />
            <ChoiceTile
              badge={isPro ? undefined : t("planBuilder.pro")}
              hint={t("planBuilder.askArnoldHint")}
              icon="sparkles"
              label={t("planBuilder.askArnold")}
              onPress={askArnold}
            />
          </VStack>
        )}
      </KeyboardAwareScrollView>
    </>
  );
};

export default CreatePlanScreen;
