import type { Exercise } from "@fitme/core";
import { Image } from "expo-image";

interface ExerciseImageProps {
  exercise: Exercise;
  /** Corner radius; a circle by default. */
  radius?: number;
  size?: number;
}

export default function ExerciseImage({
  exercise,
  radius = 666,
  size = 48,
}: ExerciseImageProps) {
  return (
    <Image
      contentFit="cover"
      source={{ uri: exercise.thumbnail_url }}
      style={{
        aspectRatio: 1 / 1,
        borderRadius: radius,
        height: size,
      }}
    />
  );
}
