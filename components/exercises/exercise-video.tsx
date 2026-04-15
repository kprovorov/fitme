import { useVideoPlayer, VideoView } from "expo-video";
import type { Exercise } from "~/lib/models";

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
      contentFit="cover"
      player={player}
      style={{
        width: "100%",
        aspectRatio: 4 / 3,
        backgroundColor: "#d5d5d5",
      }}
    />
  );
}
