import {
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MIN_FREQUENCY,
} from "@fitme/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import {
  CREATE_PLAN_NAMING_STEP,
  CreatePlanChoices,
} from "~/components/plans/create-plan-choices";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useHeaderItemColors } from "~/hooks/header-item-colors";
import { isPlanNumberIn, NEW_PLAN_ID, wholePlanNumber } from "~/lib/plan-draft";

/** How often a new Plan trains a week until the User says otherwise. */
const DEFAULT_FREQUENCY = 3;

/**
 * Where every "Create Plan" leads: build the Plan by hand, free for every
 * User, or ask Arnold, which needs Pro and shows the paywall without it.
 *
 * Building asks only for a name and how often the User trains, then replaces
 * this Screen with the Plan editor on a new draft of that many empty,
 * lettered Workouts; everything else is theirs to fill in later or leave
 * unset (ADR 0017).
 *
 * Opened with `step` `CREATE_PLAN_NAMING_STEP`, it starts at the create sheet,
 * for an entry that offered the choice itself; there is then no choice to go
 * back to, so the sheet's left item is Cancel rather than Back.
 */
const CreatePlanScreen = () => {
  const router = useRouter();
  const { t } = useTranslation();

  const { step } = useLocalSearchParams<{ step?: string }>();
  const opensAtNaming = step === CREATE_PLAN_NAMING_STEP;

  const [isNaming, setIsNaming] = useState(opensAtNaming);
  const [name, setName] = useState("");

  const [frequencyText, setFrequencyText] = useState(String(DEFAULT_FREQUENCY));

  const buildByHand = useCallback(() => setIsNaming(true), []);
  const backToChoice = useCallback(() => setIsNaming(false), []);
  const cancel = useCallback(() => router.back(), [router]);

  const openPlanner = useCallback(() => router.replace("/planner"), [router]);

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

  const itemColors = useHeaderItemColors();

  const leftItems = useMemo(
    () => () => [
      isNaming && !opensAtNaming
        ? {
            ...itemColors.plain,
            label: t("planBuilder.back"),
            onPress: backToChoice,
            type: "button" as const,
          }
        : {
            ...itemColors.plain,
            label: t("common.cancel"),
            onPress: cancel,
            type: "button" as const,
          },
    ],
    [backToChoice, cancel, isNaming, itemColors, opensAtNaming, t]
  );

  const rightItems = useMemo(
    () => () => [
      {
        ...itemColors.prominent,
        disabled: !canContinue,
        label: t("planBuilder.continue"),
        onPress: start,
        type: "button" as const,
      },
    ],
    [canContinue, itemColors, start, t]
  );

  return (
    <>
      <Stack.Screen
        // headerShown and headerTransparent are the root layout's: changing
        // them from here remounts this modal's content (FIT-628).
        options={{
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
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
            <CreatePlanChoices
              onBuildByHand={buildByHand}
              onOpenPlanner={openPlanner}
            />
          </VStack>
        )}
      </KeyboardAwareScrollView>
    </>
  );
};

export default CreatePlanScreen;
