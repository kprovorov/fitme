import { useVideoPlayer } from "expo-video";
import { VideoView } from "expo-video";
import { useEvent } from "expo";
import { StyleSheet, View, Button } from "react-native";
import React from "react";
import { Exercise } from "~/lib/models";

interface ExerciseVideoProps {
  exercise: Exercise;
}

export default function ExerciseVideo({ exercise }: ExerciseVideoProps) {
  const player = useVideoPlayer(exercise.media, (player) => {
    player.loop = true;
    player.play();
  });

  return <VideoView style={styles.video} player={player} />;
}

const styles = StyleSheet.create({
  video: {
    width: "100%",
    height: 275,
  },
});
