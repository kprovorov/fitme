import {
  formatCompactVolume,
  formatCount,
  formatNumber,
  formatTrainingTime,
  spokenCompactVolume,
  spokenTrainingTime,
} from "@fitme/i18n";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { StatItem } from "~/components/stat-item";
import { Button } from "~/components/ui/button";
import type { FullPlan, PlanWorkout } from "~/hooks/queries/plans";
import { useActivePlanQuery } from "~/hooks/queries/plans";
import {
  useLifetimeTotalsQuery,
  useOpenWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import type {
  LifetimeTotals as Totals,
  OpenWorkoutSession,
} from "~/hooks/queries/workout-sessions";
import { useStackedLayout } from "~/hooks/stacked-layout";
import {
  nextStepOf,
  openSessionPath,
  useStartWorkout,
  workoutSessionPath,
} from "~/hooks/start-workout";
import { useI18n } from "~/lib/i18n";

const MS_PER_SECOND = 1000;

/** What a total shows while it's unread: loading, or a failed read. */
const UNAVAILABLE = "—";

interface Figure {
  spoken: string;
  value: string;
}

const StartButton = ({
  plan,
  workout,
}: {
  plan: FullPlan;
  workout: PlanWorkout;
}) => {
  const router = useRouter();
  const { t } = useTranslation();

  // A 409 (another Workout's session opened meanwhile) re-reads the open
  // Workout Session, which turns the button into Resume.
  const { isStarting, startWorkout } = useStartWorkout(
    workout.id,
    (sessionId) => {
      router.push(workoutSessionPath(plan.id, workout.id, sessionId));
    }
  );

  return (
    <Button
      className="w-full"
      isLoading={isStarting}
      label={t("profile.newUser.start")}
      onPress={startWorkout}
      size="lg"
      testID="profile-start-workout"
      variant="secondary"
    />
  );
};

const ResumeButton = ({ openSession }: { openSession: OpenWorkoutSession }) => {
  const router = useRouter();
  const { t } = useTranslation();

  const resume = useCallback(
    () => router.push(openSessionPath(openSession)),
    [router, openSession]
  );

  return (
    <Button
      className="w-full"
      label={t("profile.newUser.resume")}
      onPress={resume}
      size="lg"
      variant="secondary"
    />
  );
};

const CreatePlanButton = () => {
  const router = useRouter();
  const { t } = useTranslation();

  const createPlan = useCallback(() => router.push("/plans/create"), [router]);

  return (
    <Button
      className="w-full"
      label={t("profile.newUser.createPlan")}
      onPress={createPlan}
      size="lg"
      variant="secondary"
    />
  );
};

/**
 * The New user state's one next step, exactly as History's empty card picks
 * it (`nextStepOf`): Resume the open Workout Session, else Start the active
 * Plan's next Workout, else Create a Plan. Nothing while either read hasn't
 * answered (loading, or failed with nothing read), never a guessed action.
 */
const NewUserAction = () => {
  const { data: openSession } = useOpenWorkoutSessionQuery();
  const { data: activePlan } = useActivePlanQuery();

  if (openSession === undefined || activePlan === undefined) {
    return null;
  }

  const step = nextStepOf(activePlan, openSession);

  if (step.kind === "resume") {
    return <ResumeButton openSession={step.openSession} />;
  }

  if (step.kind === "start") {
    return (
      <StartButton
        // A new Workout is a new Start: its pending state is that Workout's.
        key={step.workout.id}
        plan={step.plan}
        workout={step.workout}
      />
    );
  }

  return <CreatePlanButton />;
};

/** The three figures, each with what VoiceOver reads for it. */
const useFigures = (totals: Totals | undefined) => {
  const i18n = useI18n();
  const { t } = useTranslation();

  if (!totals) {
    const unavailable: Figure = {
      spoken: t("profile.totals.unavailable"),
      value: UNAVAILABLE,
    };

    return { time: unavailable, volume: unavailable, workouts: unavailable };
  }

  const {
    data: { duration_seconds: seconds, volume, workout_count: count },
    weight_unit: unit,
  } = totals;

  const durationMs = seconds * MS_PER_SECOND;

  return {
    time: {
      spoken: spokenTrainingTime(i18n, durationMs),
      value: formatTrainingTime(i18n, durationMs),
    },
    volume: {
      spoken: spokenCompactVolume(i18n, volume, unit),
      value: formatCompactVolume(i18n, volume, unit),
    },
    workouts: {
      spoken: formatCount(i18n, "workouts", count),
      value: formatNumber(i18n, count),
    },
  };
};

/**
 * The User's Lifetime totals under Profile's header (Figma's Profile – Pro,
 * 1476:3624): Workouts, Time and Volume, in the answer's `weight_unit`. While
 * they load, and when the read fails with nothing read (a 429 included), each
 * value is "—" (none of it lime), with no banner: the rest of Profile works. A User with no
 * qualifying Workout Session gets the New user state (1476:3838): the zeros,
 * and the button that gets them going.
 */
const LifetimeTotals = () => {
  const { t } = useTranslation();
  const stacked = useStackedLayout();
  const { data: totals } = useLifetimeTotalsQuery();
  const figures = useFigures(totals);

  const stat = (key: keyof typeof figures, accent = false) => {
    const title = t(`profile.totals.${key}`);
    const { spoken, value } = figures[key];

    return (
      <StatItem
        accent={accent}
        accessibilityLabel={t("profile.totals.label", { title, value: spoken })}
        stacked={stacked}
        title={title}
        value={value}
      />
    );
  };

  return (
    <View className="gap-sm w-full" testID="profile-lifetime-totals">
      <View className={stacked ? "gap-sm" : "gap-sm flex-row"}>
        {stat("workouts", totals !== undefined)}
        {stat("time")}
        {stat("volume")}
      </View>
      {totals?.data.workout_count === 0 ? <NewUserAction /> : null}
    </View>
  );
};

export default LifetimeTotals;
