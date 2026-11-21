import { describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";

import ExerciseVideo, {
  EXERCISE_VIDEO,
  EXERCISE_VIDEO_PLACEHOLDER,
} from "~/components/exercises/exercise-video";

type Listener = (payload: { status: string }) => void;

/** A stand-in player: its status, and the listeners `useEvent` adds. */
const mockFakePlayer = () => {
  const listeners = new Set<Listener>();

  return {
    addListener: (_event: string, listener: Listener) => {
      listeners.add(listener);

      return { remove: () => listeners.delete(listener) };
    },
    emitStatus: (status: string) => {
      for (const listener of listeners) {
        listener({ status });
      }
    },
    play: jest.fn(),
    status: "loading",
  };
};

let mockPlayer = mockFakePlayer();

jest.mock("expo-video", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    useVideoPlayer: (
      _url: string,
      setup: (videoPlayer: ReturnType<typeof mockFakePlayer>) => void
    ) => {
      setup(mockPlayer);

      return mockPlayer;
    },
    VideoView: View,
  };
});

const URL = "https://example.supabase.co/storage/v1/object/public/a.mp4";

describe("ExerciseVideo", () => {
  it("plays the clip", async () => {
    mockPlayer = mockFakePlayer();
    await render(<ExerciseVideo url={URL} />);

    expect(screen.getByTestId(EXERCISE_VIDEO)).toBeTruthy();
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(
      screen.queryByTestId(EXERCISE_VIDEO_PLACEHOLDER, {
        includeHiddenElements: true,
      })
    ).toBeNull();
  });

  it("shows the dark placeholder, never the player, once the clip fails to load", async () => {
    mockPlayer = mockFakePlayer();
    await render(<ExerciseVideo url={URL} />);

    await act(() => {
      mockPlayer.emitStatus("error");
    });

    expect(screen.queryByTestId(EXERCISE_VIDEO)).toBeNull();
    expect(
      screen.getByTestId(EXERCISE_VIDEO_PLACEHOLDER, {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
  });

  it("shows the placeholder for a player that already failed", async () => {
    mockPlayer = { ...mockFakePlayer(), status: "error" };
    await render(<ExerciseVideo url={URL} />);

    expect(screen.queryByTestId(EXERCISE_VIDEO)).toBeNull();
    expect(
      screen.getByTestId(EXERCISE_VIDEO_PLACEHOLDER, {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
  });
});
