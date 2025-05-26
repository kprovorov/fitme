import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet } from "react-native";
import React from "react";
import { Exercise } from "~/lib/models";

interface ExerciseVideoProps {
  exercise: Exercise;
}

export default function ExerciseVideo({ exercise }: ExerciseVideoProps) {
  const player = useVideoPlayer(exercise.video_url, (player) => {
    player.loop = true;
    player.play();
    player.muted = true;
    player.audioMixingMode = "mixWithOthers";
  });

  return <VideoView style={styles.video} player={player} />;
}

const styles = StyleSheet.create({
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
});
