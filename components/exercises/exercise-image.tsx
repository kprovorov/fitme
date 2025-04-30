import React from "react";
import { Image, useImage } from "expo-image";
import { Exercise } from "~/lib/models";
import { Text } from "~/components/ui/text";
import { StyleSheet } from "react-native";

interface ExerciseImageProps {
  exercise: Exercise;
}

export default function ExerciseImage({ exercise }: ExerciseImageProps) {
  const image = useImage(exercise.thumbnail_url);

  if (!image) {
    return <Text>Image is loading...</Text>;
  }

  return <Image source={image} contentFit="cover" style={styles.image} />;
}

const styles = StyleSheet.create({
  image: {
    height: 48,
    borderRadius: 6,
    aspectRatio: 1 / 1,
  },
});
