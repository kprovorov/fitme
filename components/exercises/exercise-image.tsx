import { Image } from "expo-image";
import type { Exercise } from "~/lib/models";

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
      style={{ height: size, borderRadius: 666, aspectRatio: 1 / 1 }}
    />
  );
}
