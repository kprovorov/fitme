import { Image } from "expo-image";
import { StyleSheet } from "react-native";
import type { Exercise } from "~/lib/models";

interface ExerciseImageProps {
  exercise: Exercise;
}

export default function ExerciseImage({ exercise }: ExerciseImageProps) {
  return (
    <Image
      source={{ uri: exercise.thumbnail_url }}
      contentFit="cover"
      style={styles.image}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    height: 48,
    borderRadius: 666,
    aspectRatio: 1 / 1,
  },
});
