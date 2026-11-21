import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useWindowDimensions, View } from "react-native";
import { withUniwind } from "uniwind";

import { SymbolImage } from "~/components/symbol-image";

const StyledVideoView = withUniwind(VideoView);

/** The clips' aspect ratio, which the box around one keeps. */
export const CLIP_ASPECT_RATIO = 4 / 3;

export const EXERCISE_VIDEO = "exercise-video";
export const EXERCISE_VIDEO_PLACEHOLDER = "exercise-video-placeholder";

/** The placeholder's dumbbell, as a share of the window's width. */
const SYMBOL_SCALE = 0.15;

interface ExerciseVideoProps {
  /** The Exercise's `video_url`. */
  url: string;
}

/**
 * In place of a clip that can't load (offline, a bad URL): a `secondary` tile
 * with a dumbbell, as an Exercise's thumbnail falls back to, rather than the
 * player's own white box. Decoration, hidden from VoiceOver.
 */
const ClipPlaceholder = () => {
  const { width } = useWindowDimensions();

  return (
    <View
      aria-hidden
      className="bg-secondary aspect-4/3 w-full items-center justify-center"
      importantForAccessibility="no-hide-descendants"
      testID={EXERCISE_VIDEO_PLACEHOLDER}
    >
      <SymbolImage
        className="text-muted-foreground"
        name="dumbbell.fill"
        size={Math.round(width * SYMBOL_SCALE)}
      />
    </View>
  );
};

/** One clip's player; a new URL gets a new one, its status starting over. */
const ClipPlayer = ({ url }: ExerciseVideoProps) => {
  const player = useVideoPlayer(url, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.play();
    videoPlayer.muted = true;
    videoPlayer.audioMixingMode = "mixWithOthers";
  });

  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  if (status === "error") {
    return <ClipPlaceholder />;
  }

  // The clips are shot on white, so the space they load into is near-white
  // too rather than flashing dark first
  return (
    <StyledVideoView
      className="bg-foreground aspect-4/3 w-full"
      contentFit="cover"
      nativeControls={false}
      player={player}
      testID={EXERCISE_VIDEO}
    />
  );
};

/**
 * The Exercise's clip: muted, looping, playing on its own, with no controls.
 * One that fails to load shows the placeholder instead.
 */
const ExerciseVideo = ({ url }: ExerciseVideoProps) => (
  <ClipPlayer key={url} url={url} />
);

export default ExerciseVideo;
