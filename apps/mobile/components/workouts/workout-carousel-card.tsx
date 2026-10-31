import type { Workout } from "@fitme/core";
import { rankMuscleGroups } from "@fitme/core/covers";
import { formatCount } from "@fitme/i18n";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useCovers, useExercises } from "~/hooks/queries/library";
import {
  findOpenSession,
  openSessionPath,
  useStartWorkout,
  workoutSessionPath,
} from "~/hooks/start-workout";
import { useChoiceLabels } from "~/lib/choices";
import { sizedThumbnailUrl } from "~/lib/exercise-media";
import { useI18n } from "~/lib/i18n";
import { SymbolImage } from "../symbol-image";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Text } from "../ui/text";
import { H4 } from "../ui/typography";

/** Past this text scale Preview and Start stack, or their labels break mid-word. */
const STACKED_FONT_SCALE = 1.4;

/** How many muscle-group badges a card shows before "+N". */
export const SHOWN_MUSCLE_GROUPS = 3;

/** The card's height (`min-h-100`), which its Cover is sized for. */
const CARD_HEIGHT = 400;

/** The Cover at 80% opacity, filling the card (Figma's background slot). */
const coverStyle = { ...StyleSheet.absoluteFill, opacity: 0.8 };

interface WorkoutCarouselCardProps {
  /** The Plan's Workout duration, in minutes. */
  durationMinutes: number;
  /** The card's width, in points, which its Cover is sized for. */
  width: number;
  workout: Workout;
}

/**
 * The Workout's Cover, from the Library's list, at the card's size in device
 * pixels. None (so the card stays black) for a Workout without one, an id
 * the list doesn't have, no list yet or at all, or an image that fails to
 * load.
 */
function WorkoutCover({
  coverId,
  testID,
  width,
}: {
  coverId: string | null;
  testID: string;
  width: number;
}) {
  const covers = useCovers();
  const [failedUrl, setFailedUrl] = useState<string>();
  const imageUrl = coverId ? covers.get(coverId)?.image_url : undefined;
  const uri = imageUrl
    ? sizedThumbnailUrl(imageUrl, Math.round(width), CARD_HEIGHT)
    : undefined;
  const onError = useCallback(() => setFailedUrl(uri), [uri]);
  if (!uri || failedUrl === uri) {
    return null;
  }
  return (
    <Image
      contentFit="cover"
      onError={onError}
      source={{ uri }}
      style={coverStyle}
      testID={testID}
    />
  );
}

/**
 * A Workout on the Workout tab's carousel (Figma `WorkoutCard`): its muscle
 * groups as badges at the top right, then at the bottom its name, Exercise
 * count and the Plan's duration, Preview (its Workout screen) and Start (a
 * new Workout Session through `useStartWorkout`), or Continue (its open
 * Workout Session) when it has one. The card itself isn't a tap target.
 */
export default function WorkoutCarouselCard({
  durationMinutes,
  width,
  workout,
}: WorkoutCarouselCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const i18n = useI18n();
  const labels = useChoiceLabels();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACKED_FONT_SCALE;
  const openSession = (sessionId: string) => {
    router.push(workoutSessionPath(workout.plan_id, workout.id, sessionId));
  };
  // Another Workout's open session still lets Start ask the API, whose 409
  // alerts "Finish <Workout> first" with a way into it (that session's own
  // card reads Continue).
  const { isStarting, startWorkout } = useStartWorkout(
    workout.id,
    openSession,
    { onContinueBlocking: (open) => router.push(openSessionPath(open)) }
  );
  const ownOpenSession = findOpenSession(workout);
  const continueWorkout = () => {
    if (ownOpenSession) {
      openSession(ownOpenSession.id);
    }
  };

  const exercises = [...workout.exercises].sort((a, b) => a.order - b.order);
  const shownBySlug = useExercises(
    exercises.map(({ exercise_slug }) => exercise_slug)
  );
  // Ranked like the Cover picker ranks them; only Exercises the Library has
  // answered for count, so no badges show before it has.
  const muscleGroups = rankMuscleGroups({
    exercises: exercises.flatMap(({ exercise_slug }) => {
      const shown = shownBySlug[exercise_slug];
      return shown?.isResolved ? [{ muscleGroups: shown.muscle_groups }] : [];
    }),
  });
  const hiddenGroups = muscleGroups.length - SHOWN_MUSCLE_GROUPS;

  const openPreview = () => {
    router.push(`/plans/${workout.plan_id}/workouts/${workout.id}`);
  };

  return (
    <Card
      // The Cover, then the readability scrim over it, not decoration: the
      // bottom half darkens to the card fill, solid from three quarters down,
      // under the name and buttons.
      background={
        <>
          <WorkoutCover
            coverId={workout.cover}
            testID={`workout-cover-${workout.id}`}
            width={width}
          />
          <View className="absolute inset-x-0 top-1/2 bottom-0 bg-linear-to-b from-transparent to-50% to-card/90" />
        </>
      }
      className="min-h-100 flex-1"
      padding="none"
      testID={`workout-card-${workout.id}`}
    >
      <View className="flex-1 gap-xs p-sm">
        <View className="flex-row flex-wrap justify-end gap-xs">
          {muscleGroups.slice(0, SHOWN_MUSCLE_GROUPS).map((group) => (
            <Badge key={group} variant="secondary">
              <Text>{labels.muscleGroup(group)}</Text>
            </Badge>
          ))}
          {hiddenGroups > 0 ? (
            <Badge
              accessibilityLabel={t("home.card.moreMuscleGroupsSpoken", {
                count: hiddenGroups,
              })}
              accessible
              variant="muted"
            >
              <Text>
                {t("home.card.moreMuscleGroups", { count: hiddenGroups })}
              </Text>
            </Badge>
          ) : null}
        </View>
        <View className="flex-1 justify-end gap-xs">
          <H4 className="text-primary">{workout.name}</H4>
          <View className="flex-row flex-wrap gap-x-sm">
            <View accessible className="flex-row items-center gap-1">
              <SymbolImage
                className="text-footnote-emphasized text-muted-foreground"
                name="bolt.fill"
              />
              <Text className="text-footnote-emphasized text-muted-foreground">
                {formatCount(i18n, "exercises", workout.exercises.length)}
              </Text>
            </View>
            <View
              accessibilityLabel={formatCount(i18n, "minutes", durationMinutes)}
              accessible
              className="flex-row items-center gap-1"
            >
              <SymbolImage
                className="text-footnote-emphasized text-muted-foreground"
                name="timer"
              />
              <Text className="text-footnote-emphasized text-muted-foreground">
                {t("plannedWorkout.durationMinutes", {
                  minutes: durationMinutes,
                })}
              </Text>
            </View>
          </View>
          {/* Stacked, Start (the main action) goes on top. */}
          <View
            className={stacked ? "flex-col-reverse gap-xs" : "flex-row gap-sm"}
          >
            <View className={stacked ? undefined : "flex-1"}>
              <Button
                accessibilityLabel={t("home.card.previewNamed", {
                  name: workout.name,
                })}
                label={t("home.card.preview")}
                onPress={openPreview}
                size="lg"
                variant="secondary"
              />
            </View>
            <View className={stacked ? undefined : "flex-1"}>
              {ownOpenSession ? (
                <Button
                  accessibilityLabel={t("home.card.continueNamed", {
                    name: workout.name,
                  })}
                  icon="play.circle.fill"
                  iconPosition="trailing"
                  label={t("home.card.continue")}
                  onPress={continueWorkout}
                  size="lg"
                />
              ) : (
                <Button
                  accessibilityLabel={t("home.card.startNamed", {
                    name: workout.name,
                  })}
                  icon="play.circle.fill"
                  iconPosition="trailing"
                  isLoading={isStarting}
                  label={t("home.card.start")}
                  onPress={startWorkout}
                  size="lg"
                />
              )}
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}
