import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import ExerciseVideo, {
  CLIP_ASPECT_RATIO,
} from "~/components/exercises/exercise-video";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import type { ShownExercise } from "~/hooks/queries/library";
import { useChoiceLabels } from "~/lib/choices";
import { sizedThumbnailUrl } from "~/lib/exercise-media";

/**
 * Past this text scale the muscle groups go under the clip: over it, a few
 * of them at the largest sizes outgrow the box and get cut off.
 */
const BADGES_BELOW_FONT_SCALE = 1.4;

interface SessionExerciseHeaderProps {
  /** From the Exercise in full: none while it loads, or when it has none. */
  description: string | null | undefined;
  exercise: ShownExercise;
  /** Opens the guide; without one (not resolved) nothing opens it. */
  onOpenGuide?: () => void;
}

/**
 * The thumbnail in place of a clip, sized for the render endpoint at the
 * window's width (a little over the box's), in device pixels.
 */
function Thumbnail({ url }: { url: string }) {
  const { width } = useWindowDimensions();
  return (
    <Image
      contentFit="cover"
      source={{
        uri: sizedThumbnailUrl(
          url,
          Math.round(width),
          Math.round(width / CLIP_ASPECT_RATIO)
        ),
      }}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** The muscle groups, as badges that wrap. */
function MuscleGroups({ exercise }: { exercise: ShownExercise }) {
  const labels = useChoiceLabels();
  return (
    <View className="flex-row flex-wrap gap-xs" pointerEvents="none">
      {exercise.muscle_groups.map((muscleGroup) => (
        <Badge key={muscleGroup} variant="secondary">
          <Text>{labels.muscleGroup(muscleGroup)}</Text>
        </Badge>
      ))}
    </View>
  );
}

/**
 * The exercise's description (two lines, opening the guide), then its
 * looping clip with "How to?" and its muscle groups over it, above the sets.
 */
export default function SessionExerciseHeader({
  description,
  exercise,
  onOpenGuide,
}: SessionExerciseHeaderProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const hasMedia =
    exercise.isResolved || !!exercise.video_url || !!exercise.thumbnail_url;
  const hasMuscleGroups = exercise.muscle_groups.length > 0;
  const badgesBelow = fontScale > BADGES_BELOW_FONT_SCALE;

  return (
    <>
      {description && onOpenGuide ? (
        <Pressable
          accessibilityHint={t("workoutSessionExercise.guideHint")}
          accessibilityRole="button"
          className="px-sm active:opacity-60"
          onPress={onOpenGuide}
        >
          <Text className="text-body" numberOfLines={2}>
            {description}
          </Text>
        </Pressable>
      ) : null}
      {description && !onOpenGuide ? (
        <Text className="px-sm text-body" numberOfLines={2}>
          {description}
        </Text>
      ) : null}
      {hasMedia ? (
        <View className="overflow-hidden rounded-card border-continuous bg-secondary">
          {exercise.video_url ? (
            <ExerciseVideo url={exercise.video_url} />
          ) : (
            <View style={{ aspectRatio: CLIP_ASPECT_RATIO }}>
              {exercise.thumbnail_url ? (
                <Thumbnail url={exercise.thumbnail_url} />
              ) : null}
            </View>
          )}
          <View
            className="absolute inset-0 justify-between gap-xs p-sm"
            pointerEvents="box-none"
          >
            <View className="flex-row justify-end" pointerEvents="box-none">
              {onOpenGuide ? (
                <Button
                  accessibilityHint={t("workoutSessionExercise.guideHint")}
                  fill={false}
                  label={t("workoutSessionExercise.howTo")}
                  onPress={onOpenGuide}
                  size="sm"
                />
              ) : null}
            </View>
            {hasMuscleGroups && !badgesBelow ? (
              <MuscleGroups exercise={exercise} />
            ) : null}
          </View>
        </View>
      ) : null}
      {hasMuscleGroups && badgesBelow ? (
        <MuscleGroups exercise={exercise} />
      ) : null}
    </>
  );
}
