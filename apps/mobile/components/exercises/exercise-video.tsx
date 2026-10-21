import type { Exercise } from "@fitme/core";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCSSVariable } from "uniwind";

interface ExerciseVideoProps {
  exercise: Exercise;
}

export default function ExerciseVideo({ exercise }: ExerciseVideoProps) {
  // The clips are shot on white, so the space they load into is near-white
  // too rather than flashing dark first
  const placeholder = useCSSVariable("--color-foreground") as string;
  const player = useVideoPlayer(exercise.video_url, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.play();
    videoPlayer.muted = true;
    videoPlayer.audioMixingMode = "mixWithOthers";
  });

  return (
    <VideoView
      contentFit="cover"
      player={player}
      style={{
        aspectRatio: 4 / 3,
        backgroundColor: placeholder,
        width: "100%",
      }}
    />
  );
}
