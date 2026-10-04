import type { Exercise } from "@fitme/core";
import { useVideoPlayer, VideoView } from "expo-video";

interface ExerciseVideoProps {
  exercise: Exercise;
}

export default function ExerciseVideo({ exercise }: ExerciseVideoProps) {
  const player = useVideoPlayer(exercise.video_url, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.play();
    player.muted = true;
    player.audioMixingMode = "mixWithOthers";
  });

  return (
    <VideoView
      contentFit="cover"
      player={player}
      style={{
        aspectRatio: 4 / 3,
        backgroundColor: "#d5d5d5",
        width: "100%",
      }}
    />
  );
}
