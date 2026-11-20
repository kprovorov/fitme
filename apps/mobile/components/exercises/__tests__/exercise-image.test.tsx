import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import ExerciseImage, {
  EXERCISE_IMAGE,
  EXERCISE_IMAGE_PLACEHOLDER,
} from "~/components/exercises/exercise-image";
import { sizedThumbnailUrl } from "~/lib/exercise-media";

const URL =
  "https://example.supabase.co/storage/v1/render/image/public/library/a.jpg";

const placeholder = () =>
  screen.getByTestId(EXERCISE_IMAGE_PLACEHOLDER, {
    includeHiddenElements: true,
  });

describe("ExerciseImage", () => {
  it("shows the placeholder tile, hidden from VoiceOver, without a thumbnail", async () => {
    await render(<ExerciseImage exercise={{ thumbnail_url: null }} />);

    expect(screen.queryByTestId(EXERCISE_IMAGE)).toBeNull();
    expect(placeholder()).toBeTruthy();
    expect(screen.queryByTestId(EXERCISE_IMAGE_PLACEHOLDER)).toBeNull();
  });

  it("draws the thumbnail over the tile", async () => {
    await render(<ExerciseImage exercise={{ thumbnail_url: URL }} size={50} />);

    expect(screen.getByTestId(EXERCISE_IMAGE).props.source).toEqual([
      { uri: sizedThumbnailUrl(URL, 50) },
    ]);
    expect(placeholder()).toBeTruthy();
  });

  it("drops the thumbnail and keeps the tile when it fails to load", async () => {
    await render(<ExerciseImage exercise={{ thumbnail_url: URL }} />);

    await fireEvent(screen.getByTestId(EXERCISE_IMAGE), "error", {
      nativeEvent: { error: "failed" },
    });

    expect(screen.queryByTestId(EXERCISE_IMAGE)).toBeNull();
    expect(placeholder()).toBeTruthy();
  });

  it("tries a new thumbnail after an earlier one failed", async () => {
    const { rerender } = await render(
      <ExerciseImage exercise={{ thumbnail_url: URL }} />
    );

    await fireEvent(screen.getByTestId(EXERCISE_IMAGE), "error", {
      nativeEvent: { error: "failed" },
    });
    await rerender(
      <ExerciseImage exercise={{ thumbnail_url: `${URL}?v=2` }} />
    );

    expect(screen.getByTestId(EXERCISE_IMAGE)).toBeTruthy();
  });
});
