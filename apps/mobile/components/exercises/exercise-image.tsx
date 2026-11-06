import { Image as ExpoImage } from "expo-image";
import { View } from "react-native";
import { ScopedVariables, withUniwind } from "uniwind";

import { sizedThumbnailUrl } from "~/lib/exercise-media";

const Image = withUniwind(ExpoImage);

interface ExerciseImageProps {
  exercise: { thumbnail_url: string | null };
  /** Corner radius; a circle by default. */
  radius?: number;
  size?: number;
}

/** An Exercise's thumbnail, or an empty tile when it has none (not resolved). */
const ExerciseImage = ({
  exercise,
  radius = 666,
  size = 48,
}: ExerciseImageProps) => (
  <ScopedVariables
    variables={{
      "--exercise-image-radius": radius,
      "--exercise-image-size": size,
    }}
  >
    {exercise.thumbnail_url ? (
      <Image
        className="aspect-square h-(--exercise-image-size) rounded-(--exercise-image-radius)"
        contentFit="cover"
        source={{ uri: sizedThumbnailUrl(exercise.thumbnail_url, size) }}
      />
    ) : (
      <View className="bg-secondary aspect-square h-(--exercise-image-size) rounded-(--exercise-image-radius)" />
    )}
  </ScopedVariables>
);

export default ExerciseImage;
