import { useVideoPlayer, VideoView } from "expo-video";
import { withUniwind } from "uniwind";

const StyledVideoView = withUniwind(VideoView);

/** The clips' aspect ratio, which the box around one keeps. */
export const CLIP_ASPECT_RATIO = 4 / 3;

interface ExerciseVideoProps {
  /** The Exercise's `video_url`. */
  url: string;
}

/** The Exercise's clip: muted, looping, playing on its own, with no controls. */
const ExerciseVideo = ({ url }: ExerciseVideoProps) => {
  const player = useVideoPlayer(url, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.play();
    videoPlayer.muted = true;
    videoPlayer.audioMixingMode = "mixWithOthers";
  });

  // The clips are shot on white, so the space they load into is near-white
  // too rather than flashing dark first
  return (
    <StyledVideoView
      className="bg-foreground aspect-4/3 w-full"
      contentFit="cover"
      nativeControls={false}
      player={player}
    />
  );
};

export default ExerciseVideo;
