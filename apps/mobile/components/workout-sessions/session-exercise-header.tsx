import { muscleGroupToName } from "@fitme/core";
import { Image } from "expo-image";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import ExerciseVideo, {
  CLIP_ASPECT_RATIO,
} from "~/components/exercises/exercise-video";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import type { ShownExercise } from "~/hooks/queries/exercise-library";
import { sizedThumbnailUrl } from "~/lib/exercise-media";

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

/**
 * The exercise's description (two lines, opening the guide), then its
 * looping clip with "How to?" and its muscle groups over it, above the sets.
 */
export default function SessionExerciseHeader({
  description,
  exercise,
  onOpenGuide,
}: SessionExerciseHeaderProps) {
  const hasMedia =
    exercise.isResolved || !!exercise.video_url || !!exercise.thumbnail_url;

  return (
    <>
      {description && onOpenGuide ? (
        <Pressable
          accessibilityHint="Opens the exercise guide"
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
                  accessibilityHint="Opens the exercise guide"
                  fill={false}
                  label="How to?"
                  onPress={onOpenGuide}
                  size="sm"
                />
              ) : null}
            </View>
            {exercise.muscle_groups.length > 0 ? (
              <View className="flex-row flex-wrap gap-xs" pointerEvents="none">
                {exercise.muscle_groups.map((muscleGroup) => (
                  <Badge key={muscleGroup} variant="secondary">
                    <Text>{muscleGroupToName(muscleGroup)}</Text>
                  </Badge>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </>
  );
}
