import { Image as ExpoImage } from "expo-image";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ScopedVariables, withUniwind } from "uniwind";

import { SymbolImage } from "~/components/symbol-image";
import { sizedThumbnailUrl } from "~/lib/exercise-media";

const Image = withUniwind(ExpoImage);

export const EXERCISE_IMAGE = "exercise-image";
export const EXERCISE_IMAGE_PLACEHOLDER = "exercise-image-placeholder";

/** The placeholder's dumbbell, as a share of the tile's side. */
const SYMBOL_SCALE = 0.4;

interface ExerciseImageProps {
  exercise: { thumbnail_url: string | null };
  /** Corner radius; a circle by default. */
  radius?: number;
  size?: number;
}

/**
 * An Exercise's thumbnail, drawn over a placeholder tile of the same size (a
 * `secondary` fill with a dumbbell), so a row never shifts while it loads and
 * keeps the tile when the Exercise has none (not resolved) or the image fails
 * to load. The tile is decoration, hidden from VoiceOver.
 */
const ExerciseImage = ({
  exercise,
  radius = 666,
  size = 48,
}: ExerciseImageProps) => {
  const uri = exercise.thumbnail_url
    ? sizedThumbnailUrl(exercise.thumbnail_url, size)
    : undefined;

  const [failedUri, setFailedUri] = useState<string>();
  const onError = useCallback(() => setFailedUri(uri), [uri]);

  return (
    <ScopedVariables
      variables={{
        "--exercise-image-radius": radius,
        "--exercise-image-size": size,
      }}
    >
      <View className="aspect-square h-(--exercise-image-size) overflow-hidden rounded-(--exercise-image-radius)">
        <View
          aria-hidden
          className="bg-secondary absolute inset-0 items-center justify-center"
          importantForAccessibility="no-hide-descendants"
          testID={EXERCISE_IMAGE_PLACEHOLDER}
        >
          <SymbolImage
            className="text-muted-foreground"
            name="dumbbell.fill"
            size={Math.round(size * SYMBOL_SCALE)}
          />
        </View>
        {uri && failedUri !== uri ? (
          <Image
            className="absolute inset-0"
            contentFit="cover"
            onError={onError}
            source={{ uri }}
            testID={EXERCISE_IMAGE}
          />
        ) : null}
      </View>
    </ScopedVariables>
  );
};

export default ExerciseImage;
