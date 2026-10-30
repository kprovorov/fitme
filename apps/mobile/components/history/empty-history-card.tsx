import type { Plan, Workout } from "@fitme/core";
import { formatCount } from "@fitme/i18n";
import { useRouter } from "expo-router";
import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Card, CardDescription } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import type { OpenWorkoutSession } from "~/hooks/queries/workout-sessions";
import {
  openSessionPath,
  useStartWorkout,
  workoutSessionPath,
} from "~/hooks/start-workout";
import { useI18n } from "~/lib/i18n";

/** The point size of the card's dumbbell, Figma's 18 pt. */
const ICON_SIZE = 18;

/** The next Workout of a Plan's rotation, if it has one. */
const nextWorkoutOf = (plan: Plan): Workout | undefined =>
  // A copy: plan.workouts is the query cache's array, never sorted in place.
  [...plan.workouts].sort((a, b) => a.order - b.order)[0];

function StartAction({ plan, workout }: { plan: Plan; workout: Workout }) {
  const router = useRouter();
  const { t } = useTranslation();
  const i18n = useI18n();
  // A 409 (another Workout's session opened meanwhile) re-reads the open
  // Workout Session, which turns the card into Resume.
  const { isStarting, startWorkout } = useStartWorkout(
    workout.id,
    (sessionId) => {
      router.push(workoutSessionPath(plan.id, workout.id, sessionId));
    }
  );
  return (
    <>
      <Button
        className="w-full"
        isLoading={isStarting}
        label={t("history.empty.start", { name: workout.name })}
        onPress={startWorkout}
        size="lg"
        testID="history-start-workout"
      />
      <Text className="text-center text-footnote text-muted-foreground">
        {t("history.empty.nextUp", {
          exercises: formatCount(i18n, "exercises", workout.exercises.length),
          plan: plan.name,
        })}
      </Text>
    </>
  );
}

function ResumeAction({ openSession }: { openSession: OpenWorkoutSession }) {
  const router = useRouter();
  const { t } = useTranslation();
  const name = openSession.workoutName;
  const resume = useCallback(
    () => router.push(openSessionPath(openSession)),
    [router, openSession]
  );
  return (
    <>
      <Button
        className="w-full"
        label={
          name
            ? t("history.empty.resumeNamed", { name })
            : t("history.empty.resume")
        }
        onPress={resume}
        size="lg"
      />
      <Text className="text-center text-footnote text-muted-foreground">
        {t("history.empty.inProgress")}
      </Text>
    </>
  );
}

function CreatePlanAction() {
  const router = useRouter();
  const { t } = useTranslation();
  const createPlan = useCallback(() => router.push("/planner"), [router]);
  return (
    <Button
      className="w-full"
      label={t("history.empty.createPlan")}
      onPress={createPlan}
      size="lg"
    />
  );
}

interface EmptyHistoryCardProps {
  /** The active Plan, `null` with none (both read, never guessed). */
  activePlan: Plan | null;
  /** The User's open Workout Session, `null` with none. */
  openSession: OpenWorkoutSession | null;
}

/**
 * History with no finished Workout Session, after Figma's empty state: what
 * shows up here, and the one next step. Resume the open Workout Session
 * first (a User has at most one, ADR 0013, with or without an active Plan),
 * else Start the active Plan's next Workout, else Create a plan. An active
 * Plan with no Workout has nothing to start, so it gets Create a plan too.
 */
export function EmptyHistoryCard({
  activePlan,
  openSession,
}: EmptyHistoryCardProps) {
  const { t } = useTranslation();
  const nextWorkout = activePlan ? nextWorkoutOf(activePlan) : undefined;

  let action: ReactNode;
  if (openSession) {
    action = <ResumeAction openSession={openSession} />;
  } else if (activePlan && nextWorkout) {
    action = (
      <StartAction
        // A new Workout is a new Start: its pending state is that Workout's.
        key={nextWorkout.id}
        plan={activePlan}
        workout={nextWorkout}
      />
    );
  } else {
    action = <CreatePlanAction />;
  }

  return (
    <Card testID="history-empty">
      <View className="items-center gap-sm pt-sm pb-xs">
        <View
          aria-hidden
          className="size-18 items-center justify-center rounded-full bg-secondary"
          importantForAccessibility="no-hide-descendants"
        >
          <SymbolImage
            className="text-primary"
            name="dumbbell.fill"
            size={ICON_SIZE}
          />
        </View>
        <View className="w-full items-center gap-xs">
          <Text
            accessibilityRole="header"
            className="text-center text-foreground text-title-2-emphasized"
          >
            {t("history.empty.title")}
          </Text>
          <CardDescription className="text-center">
            {t("history.empty.body")}
          </CardDescription>
        </View>
        {action}
      </View>
    </Card>
  );
}
