import { Image } from "expo-image";
import { View } from "react-native";
import { sizedThumbnailUrl } from "~/lib/exercise-media";

interface ExerciseImageProps {
  exercise: { thumbnail_url: string | null };
  /** Corner radius; a circle by default. */
  radius?: number;
  size?: number;
}

/** An Exercise's thumbnail, or an empty tile when it has none (not resolved). */
export default function ExerciseImage({
  exercise,
  radius = 666,
  size = 48,
}: ExerciseImageProps) {
  const style = { aspectRatio: 1 / 1, borderRadius: radius, height: size };
  if (!exercise.thumbnail_url) {
    return <View className="bg-secondary" style={style} />;
  }
  return (
    <Image
      contentFit="cover"
      source={{ uri: sizedThumbnailUrl(exercise.thumbnail_url, size) }}
      style={style}
    />
  );
}
