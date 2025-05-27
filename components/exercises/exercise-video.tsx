import { VideoView, useVideoPlayer } from "expo-video";
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

  return (
    <VideoView
      style={{
        width: "100%",
        aspectRatio: 4 / 3,
        backgroundColor: "#d5d5d5",
      }}
      contentFit="cover"
      player={player}
    />
  );
}
