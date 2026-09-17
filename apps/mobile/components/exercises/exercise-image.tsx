import type { Exercise } from "@fitme/core";
import { Image } from "expo-image";

interface ExerciseImageProps {
  exercise: Exercise;
  size?: number;
}

export default function ExerciseImage({
  exercise,
  size = 48,
}: ExerciseImageProps) {
  return (
    <Image
      contentFit="cover"
      source={{ uri: exercise.thumbnail_url }}
      style={{ aspectRatio: 1 / 1, borderRadius: 666, height: size }}
    />
  );
}
